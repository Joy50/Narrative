"""AI Council orchestration over the shared investigation workflow."""
import logging

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config.pagination import paginate
from .models import Assessment, Claim, CouncilRun
from .services import operator_name

logger = logging.getLogger(__name__)


class RunSerializer(serializers.ModelSerializer):
    claim_id = serializers.CharField(source='claim.claim_id', read_only=True)

    class Meta:
        model = CouncilRun
        fields = ('id', 'claim_id', 'status', 'snapshot', 'agents', 'checks',
                  'draft', 'error', 'assessment', 'case', 'created_at', 'completed_at')


class StartSerializer(serializers.Serializer):
    claim_id = serializers.CharField(max_length=40)


def analyze(run):
    from django.conf import settings
    from .workflow import execute_pipeline, generate_report, record_case, AnalysisSerializer
    claim = run.claim
    claim.handling_mode, claim.analyst, claim.assigned_to = 'council', 'AI Council', None
    claim.save(update_fields=['handling_mode', 'analyst', 'assigned_to'])
    case = record_case(claim, run.started_by, 'council_started', f'AI Council run #{run.pk} started.')
    case.assignee, case.assignee_name = None, 'AI Council'
    case.save(update_fields=['assignee', 'assignee_name', 'updated_at'])
    analyses = execute_pipeline(claim, run.started_by)
    claim.refresh_from_db()
    completed = all(row.status == 'completed' for row in analyses)
    report = generate_report(claim, run.started_by) if completed else None
    run.case = case
    run.snapshot = {
        'claim_id': claim.claim_id, 'text': claim.text, 'language': claim.language,
        'source': claim.source, 'url': claim.url, 'evidence': claim.evidence,
        'engine': settings.OPENAI_MODEL or 'OpenAI not configured',
        'analysis_runs': AnalysisSerializer(analyses, many=True).data,
        'report_id': report.pk if report else None,
    }
    outputs = {row.kind: row for row in analyses}
    def output(name, role, kind):
        row = outputs.get(kind)
        return {'name': name, 'role': role,
                'status': ('complete' if row.status == 'completed' else row.status) if row else 'queued',
                'body': (row.result.get('summary') or row.error) if row else 'Waiting for the preceding investigation stage.'}
    run.agents = [
        output('Claim Agent', 'Claim extraction and verification', 'verification'),
        output('OSINT Agent', 'OpenAI public web research with citations', 'verification'),
        output('Forensic Agent', 'Linked original media analysis' if claim.media_type else 'No media original requires analysis', 'forensic'),
        output('Context Agent', 'Narrative and context analysis', 'narrative'),
        output('Challenge Agent', 'Evidence gaps and review urgency', 'narrative'),
        {'name': 'Draft Composer', 'role': 'Investigation report draft', 'status': 'complete' if report else 'queued',
         'body': f'Intelligence report #{report.pk} saved as a draft for review.' if report else 'Investigation is incomplete; report generation remains pending.'},
    ]
    if not claim.media_type:
        run.agents[2].update(status='not_required', body='No image, audio, or video original is linked to this claim.')
    run.checks = ['AI outputs are drafts and do not approve the claim or report.',
                  'Sources and forensic limitations must be reviewed before a verdict.',
                  'Alerts indicate review urgency, not proof that a claim is false.']
    run.draft = '\n\n'.join(f'{row.kind.upper()}: {row.status}\n{row.result.get("summary", "")}\n{row.error}' for row in analyses)
    run.status = 'completed' if completed else analyses[-1].status
    run.error = '' if completed else analyses[-1].error
    run.completed_at = timezone.now()
    run.save()


class CouncilListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = CouncilRun.objects.select_related('claim')
        if request.query_params.get('claim_id'):
            qs = qs.filter(claim__claim_id=request.query_params['claim_id'])
        return paginate(qs, request, serializer_class=RunSerializer)

    def post(self, request):
        data = StartSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        claim = get_object_or_404(Claim, claim_id=data.validated_data['claim_id'])
        run = CouncilRun.objects.create(claim=claim, started_by=request.user)
        try:
            analyze(run)
        except Exception:
            logger.exception('Council run %s failed', run.pk)
            run.status = 'failed'
            run.error = 'Analysis failed. Start a new run to retry.'
            run.completed_at = timezone.now()
            run.save(update_fields=['status', 'error', 'completed_at'])
        return Response(RunSerializer(run).data, status=201)


class CouncilDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(RunSerializer(get_object_or_404(CouncilRun, pk=pk)).data)


class CouncilAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        run = get_object_or_404(CouncilRun.objects.select_for_update(), pk=pk)
        if run.status != 'completed' or not run.draft:
            return Response({'detail': 'Only a completed run can be saved for review.'}, status=400)
        if not run.assessment_id:
            from cases.models import CaseEvent
            from cases.services import open_case

            run.case, _ = open_case(user=request.user, claim_id=run.claim.claim_id)
            run.assessment = Assessment.objects.create(
                claim=run.claim, verdict=Claim.Status.UNVERIFIED, confidence=0,
                notes=run.draft, analyst=operator_name(request.user), stage=Assessment.Stage.ANALYST,
            )
            CaseEvent.objects.create(case=run.case, action='council_draft',
                                     actor_name=operator_name(request.user), note=run.draft)
            run.save(update_fields=['assessment', 'case'])
        return Response(RunSerializer(run).data)
