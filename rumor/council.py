"""Persisted, synchronous council analysis using the local evidence corpus.

No external model or media detector is configured. Outputs explicitly identify
these limits; corpus similarity never establishes a verdict.
"""
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
from .services import extract_atomic_claims, match_validated, operator_name

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
    claim = run.claim
    hit = match_validated(claim)
    atomic = extract_atomic_claims(claim.text)
    candidate = None if not hit else {
        'claim_id': hit.claim_id, 'text': hit.text, 'url': hit.source_url,
        'authority': hit.authority, 'evidence': hit.evidence,
        'verified_at': hit.verified_at.isoformat(),
    }
    run.snapshot = {
        'claim_id': claim.claim_id, 'text': claim.text, 'language': claim.language,
        'source': claim.source, 'url': claim.url, 'evidence': claim.evidence,
        'first_seen': claim.first_seen.isoformat(), 'cluster': claim.cluster,
        'corpus_candidate': candidate, 'engine': 'local-rules-v1',
    }

    def agent(name, role, body, status='complete'):
        return {'name': name, 'role': role, 'body': body, 'status': status}

    run.agents = [
        agent('Claim Agent', 'Rule-based claim segmentation',
              f'Language: {claim.language}. {len(atomic)} segment(s): ' + ' | '.join(atomic)),
        agent('OSINT Agent', 'Local validated-claim corpus lookup',
              f'Candidate {hit.claim_id}: {hit.text}. Authority: {hit.authority}. '
              'Similarity is a retrieval hint, not corroboration. No live web search was performed.'
              if hit else 'No candidate found in the local corpus. No live web search was performed.',
              'review'),
        agent('Forensic Agent', 'Media analysis availability',
              'No media detector is configured. Authenticity, manipulation and detector scores are unavailable.', 'unavailable'),
        agent('Context Agent', 'Recorded chronology and context',
              f'First recorded: {claim.first_seen.isoformat()}. Cluster: {claim.cluster or "Unassigned"}. '
              'This intake timestamp does not establish the date of the event.'),
        agent('Challenge Agent', 'Evidence limitations and consistency',
              'Retrieved candidates require manual comparison. Source URLs have not been fetched or validated. '
              'Missing evidence does not refute a claim.', 'review'),
        agent('Draft Composer', 'Conservative assessment for analyst review',
              'Draft prepared as Unverified with confidence unset. Human review is required.'),
    ]
    run.checks = [
        'Local rules produced this run; no external AI provider is configured.',
        'Corpus similarity does not establish support or contradiction.',
        'Media authenticity and source availability remain unchecked.',
        'Saving this draft does not change the claim verdict or approve publication.',
    ]
    run.draft = (
        f'Council run #{run.pk} · {claim.claim_id}\nClaim: {claim.text}\n'
        f'Recorded evidence: {claim.evidence or "None recorded"}\n'
        + (f'Corpus candidate: {hit.claim_id} · {hit.authority}\n{hit.text}\n'
           f'Recorded source: {hit.source_url or "No URL recorded"}\n' if hit else 'No local corpus candidate found.\n')
        + 'Proposed verdict: Unverified. Confidence: unset.\n'
        + '\n'.join(run.checks)
    )
    run.status = 'completed'
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
