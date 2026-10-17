"""Shared analyst and council investigation workflow."""
import hashlib
import logging
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cases.models import CaseEvent
from cases.services import open_case
from . import providers
from .models import AnalysisRun, Assessment, Claim, Evidence, IntelligenceReport, ReportEvent, ReportRevision, WorkflowAlert
from .services import operator_name, rebuild_clusters

logger = logging.getLogger(__name__)


class AnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnalysisRun
        fields = ('id', 'kind', 'status', 'provider', 'result', 'error', 'created_at', 'completed_at')


def latest(claim, kind):
    return claim.analysis_runs.filter(kind=kind).first()


def is_current(run, context):
    keys = ('text', 'source_url', 'originals') if run and run.kind == 'forensic' else ('text', 'source_url', 'notes', 'analyst_evidence', 'originals')
    return bool(run and all(run.input_snapshot.get(key) == context.get(key) for key in keys))


def context_for(claim):
    return {
        'claim_id': claim.claim_id, 'text': claim.text, 'source_url': claim.url,
        'source': claim.source, 'language': claim.language, 'notes': claim.notes,
        'analyst_evidence': claim.evidence, 'analyst_verdict': claim.status,
        'originals': list(claim.originals.values('id', 'name', 'media_type', 'sha256', 'size', 'source_url', 'notes')),
        'previous_analysis': {kind: row.result for kind in ('verification', 'forensic')
                              if (row := latest(claim, kind)) and row.status == 'completed'},
        'related_claims': list(Claim.objects.filter(cluster=claim.cluster).exclude(pk=claim.pk).values('claim_id', 'text', 'status')[:20]) if claim.cluster else [],
    }


def record_case(claim, user, action, note):
    case, _ = open_case(user=user, claim_id=claim.claim_id)
    before = case.state
    if action.endswith('_analysis') and case.state in ('NEW', 'TRIAGED'):
        case.state = 'IN_ANALYSIS'
        case.save(update_fields=['state', 'updated_at'])
    CaseEvent.objects.create(case=case, action=action, actor_name=operator_name(user), note=note,
                             from_state=before, to_state=case.state)
    return case


def execute_stage(claim, kind, user):
    if kind not in ('verification', 'forensic', 'narrative'):
        raise ValidationError('Unknown analysis stage.')
    # A terminated development process must not leave a claim permanently locked.
    claim.analysis_runs.filter(status='running', created_at__lt=timezone.now()-timedelta(minutes=15)).update(
        status='failed', error='Analysis interrupted. Retry this stage.', completed_at=timezone.now())
    snapshot = context_for(claim)
    try:
        with transaction.atomic():
            run = AnalysisRun.objects.create(claim=claim, kind=kind, input_snapshot=snapshot, created_by=user,
                                            provider='forensic-service' if kind == 'forensic' else 'OpenAI')
    except IntegrityError:
        raise ValidationError('This analysis stage is already running for the claim.') from None
    blocked_stage = kind
    try:
        if kind == 'verification':
            result = providers.verify(snapshot)
        elif kind == 'forensic':
            originals = list(claim.originals.filter(media_type__in=['image', 'video', 'audio']))
            if not originals:
                raise providers.NotConfigured('No original media is linked. Upload the original to this claim before forensic analysis.')
            for obj in originals:
                checksum = hashlib.sha256()
                with obj.file.open('rb') as file:
                    for chunk in file.chunks():
                        checksum.update(chunk)
                if checksum.hexdigest() != obj.sha256:
                    raise providers.ProviderError('An original failed its integrity check. Review the evidence repository.')
            result = providers.forensic(snapshot, originals)
        else:
            verification = latest(claim, 'verification')
            if not (verification and verification.status == 'completed' and is_current(verification, snapshot)) and not claim.assessments.exists():
                blocked_stage = 'verification'
                raise providers.NotConfigured('Complete claim verification or save an analyst assessment before narrative analysis.')
            if claim.media_type:
                forensic = latest(claim, 'forensic')
                if not forensic or forensic.status != 'completed' or not is_current(forensic, snapshot):
                    blocked_stage = 'forensic'
                    raise providers.NotConfigured('Complete the linked media forensic analysis before narrative analysis.')
            result = providers.narrative(snapshot)
        run.result, run.status = result, 'completed'
    except providers.NotConfigured as exc:
        run.status, run.error = 'needs_configuration', str(exc)
    except providers.ProviderError as exc:
        run.status, run.error = 'failed', str(exc)
    except Exception:
        logger.exception('Analysis stage %s failed for claim %s', kind, claim.pk)
        run.status, run.error = 'failed', 'Analysis could not be completed. Check backend logs and retry.'
    run.completed_at = timezone.now()
    with transaction.atomic():
        run.save()
        if kind == 'narrative' and run.status == 'completed':
            claim.cluster = slugify(run.result['label'])[:80] or claim.cluster or 'unclassified'
            claim.workflow_stage = 'report_ready'
            claim.save(update_fields=['cluster', 'workflow_stage'])
            alarming = bool(run.result['alarming'] and run.result['reasons'])
            WorkflowAlert.objects.update_or_create(claim=claim, defaults={
                'analysis': run, 'severity': run.result['severity'], 'summary': run.result['summary'],
                'reasons': run.result['reasons'], 'is_active': alarming,
            })
            rebuild_clusters()
        elif run.status == 'completed':
            media_run = latest(claim, 'forensic')
            media_pending = claim.media_type and (not media_run or media_run.status != 'completed')
            claim.workflow_stage = ('forensic' if media_pending else 'narrative') if kind == 'verification' else 'narrative'
            claim.save(update_fields=['workflow_stage'])
        else:
            claim.workflow_stage = blocked_stage
            claim.save(update_fields=['workflow_stage'])
        case = record_case(claim, user, f'{kind}_analysis', f'Analysis #{run.pk}: {run.status}. {run.error or run.result.get("summary", "")}')
        if kind == 'narrative' and run.status == 'completed' and case.state == 'IN_ANALYSIS':
            case.state = 'ANALYST_REVIEW'
            case.save(update_fields=['state', 'updated_at'])
            CaseEvent.objects.create(case=case, action='analysis_ready', actor_name=operator_name(user),
                                     from_state='IN_ANALYSIS', to_state='ANALYST_REVIEW', note='Investigation draft ready for review.')
    return run


def execute_pipeline(claim, user):
    runs = []
    # Revisit verification with any transcript, extracted claims and findings
    # returned by the media service before assessing the narrative.
    for kind in ['verification'] + (['forensic', 'verification'] if claim.media_type else []) + ['narrative']:
        run = execute_stage(claim, kind, user)
        runs.append(run)
        if run.status != 'completed':
            break
    return runs


@transaction.atomic
def generate_report(claim, user):
    claim = Claim.objects.select_for_update().get(pk=claim.pk)
    case, _ = open_case(user=user, claim_id=claim.claim_id)
    analyses = list(claim.analysis_runs.all()[:30])
    sources = context_for(claim)
    if claim.generated_report_id:
        old = claim.generated_report.source_snapshot
        if (all(old.get(key) == sources.get(key) for key in ('text', 'source_url', 'notes', 'analyst_evidence', 'analyst_verdict', 'originals'))
                and [row['id'] for row in old.get('analysis_runs', [])] == [row.pk for row in analyses]):
            return claim.generated_report
    sources['captured_at'] = timezone.now().isoformat()
    sources['claims'] = [{
        'id': claim.pk, 'claim_id': claim.claim_id, 'text': claim.text, 'status': claim.status,
        'source': claim.source, 'url': claim.url, 'evidence': claim.evidence,
    }]
    sources['evidence'] = list(claim.originals.values('id', 'name', 'sha256', 'integrity', 'case_reference', 'source_url'))
    sources['analysis_runs'] = AnalysisSerializer(analyses, many=True).data
    current = {}
    for run in analyses:
        current.setdefault(run.kind, run)
    gaps = []
    expected = ['verification'] + (['forensic'] if claim.media_type else []) + ['narrative']
    for kind in expected:
        row = current.get(kind)
        if not row:
            gaps.append(f'{kind}: not yet performed.')
        elif row.status != 'completed':
            gaps.append(f'{kind}: {row.error or row.status}')
        elif not is_current(row, sources):
            gaps.append(f'{kind}: current evidence has changed; rerun required.')
    narrative = latest(claim, 'narrative')
    summary = (narrative.result.get('summary') if narrative else '') or claim.text
    findings = '\n\n'.join(f'{run.kind.upper()} [{run.status}]\n{run.result.get("summary", "")}\n{run.error}' for run in reversed(list(current.values())))
    obj = IntelligenceReport.objects.create(
        title=f'Investigation of {claim.claim_id}', case_reference=case.case_number,
        summary=summary, findings=findings or 'No analysis completed yet.',
        recommendations='Human review required before approval or distribution.\n' + '\n'.join(gaps),
        source_snapshot=sources, created_by=user,
    )
    ReportRevision.objects.create(report=obj, version=1, snapshot={
        key: getattr(obj, key) for key in ('title', 'language', 'case_reference', 'summary', 'findings', 'recommendations', 'source_snapshot')
    }, actor=user.get_username())
    ReportEvent.objects.create(report=obj, action='Created from investigation', actor=user.get_username())
    claim.generated_report = obj
    claim.save(update_fields=['generated_report'])
    record_case(claim, user, 'report_draft', f'Intelligence report #{obj.pk} created as a draft.')
    return obj


def workflow_payload(claim):
    case = claim.investigations.first()
    alert = WorkflowAlert.objects.filter(claim=claim, is_active=True).first()
    context = context_for(claim)
    analyses = AnalysisSerializer(claim.analysis_runs.all()[:30], many=True).data
    for row, obj in zip(analyses, claim.analysis_runs.all()[:30]):
        row['current'] = is_current(obj, context)
    return {
        'claim_id': claim.claim_id, 'text': claim.text, 'media_type': claim.media_type,
        'stage': claim.workflow_stage, 'handling_mode': claim.handling_mode,
        'assigned_to': claim.assigned_to_id, 'analyst': claim.analyst,
        'case': case.case_number if case else None, 'cluster': claim.cluster,
        'report_id': claim.generated_report_id,
        'originals': list(claim.originals.values('id', 'name', 'media_type', 'sha256', 'size', 'notes')),
        'analyses': analyses,
        'alert': {'id': f'WF-{claim.pk}', 'severity': alert.severity, 'summary': alert.summary, 'reasons': alert.reasons} if alert else None,
    }


def recorded_evidence_for(claim):
    rows = [{'name': obj.name, 'snippet': obj.notes or 'Linked original file; inspect its recorded integrity and provenance.',
             'meta': f'EV-{obj.pk:06d} · SHA-256 {obj.sha256}', 'stance': 'Original', 'stance_class': 'neutral'}
            for obj in claim.originals.all()]
    run = latest(claim, 'verification')
    if run and run.status == 'completed':
        rows.extend({'name': citation['title'], 'snippet': citation['url'], 'meta': f'OpenAI research run #{run.pk}',
                     'stance': 'Research source', 'stance_class': 'neutral'} for citation in run.result.get('citations', []))
    return rows


class WorkflowView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, claim_id):
        return Response(workflow_payload(get_object_or_404(Claim, claim_id=claim_id)))


class AssignSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(min_value=1, required=False)
    mode = serializers.ChoiceField(choices=['analyst', 'council'], default='analyst')


class AssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = get_user_model().objects.filter(is_active=True).select_related('profile')
        return Response([{'id': row.pk, 'name': operator_name(row), 'username': row.username} for row in users])

    @transaction.atomic
    def post(self, request, claim_id):
        data = AssignSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        claim = get_object_or_404(Claim.objects.select_for_update(), claim_id=claim_id)
        mode = data.validated_data['mode']
        assignee = get_object_or_404(get_user_model(), pk=data.validated_data.get('user_id', request.user.pk), is_active=True) if mode == 'analyst' else None
        claim.assigned_to, claim.handling_mode = assignee, mode
        claim.analyst = operator_name(assignee) if assignee else 'AI Council'
        claim.workflow_stage = 'verification'
        claim.save(update_fields=['assigned_to', 'handling_mode', 'analyst', 'workflow_stage'])
        case = record_case(claim, request.user, 'assign', f'Investigation assigned to {claim.analyst}.')
        case.assignee, case.assignee_name = assignee, claim.analyst
        case.save(update_fields=['assignee', 'assignee_name', 'updated_at'])
        return Response(workflow_payload(claim))


class RunWorkflowView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, claim_id):
        claim = get_object_or_404(Claim, claim_id=claim_id)
        kind = request.data.get('stage', 'all')
        if kind == 'all':
            execute_pipeline(claim, request.user)
        else:
            run = execute_stage(claim, kind, request.user)
            if kind == 'forensic' and run.status == 'completed':
                execute_stage(claim, 'verification', request.user)
        return Response(workflow_payload(claim))


class WorkflowReportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, claim_id):
        claim = get_object_or_404(Claim, claim_id=claim_id)
        report = generate_report(claim, request.user)
        return Response({'report_id': report.pk, 'status': report.status})
