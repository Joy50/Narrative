from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config.pagination import paginate

from .models import Claim, NarrativeCluster, SourceFeed, ValidatedClaim
from .serializers import (
    AssessmentSerializer,
    ClaimSerializer,
    NarrativeClusterSerializer,
    SourceFeedSerializer,
    ValidatedClaimSerializer,
)
from .services import (
    apply_assessment,
    assign_alert,
    build_alert_analysis,
    build_narrative_analysis,
    evidence_for,
    extract_from_existing,
    ingest_text,
    match_validated,
    operator_name,
    rebuild_clusters,
    scan_sources,
    triage_priority,
)


def serialize_claims(qs):
    corpus = list(ValidatedClaim.objects.filter(is_active=True))
    matches = {claim.claim_id: match_validated(claim, corpus) for claim in qs}
    return ClaimSerializer(qs, many=True, context={'validated_matches': matches}).data


def serialize_claim(claim):
    hit = match_validated(claim)
    return ClaimSerializer(claim, context={'validated_matches': {claim.claim_id: hit}}).data


class OverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        claims = Claim.objects.all()
        return Response({
            'extracted': claims.count(),
            'unverified': claims.filter(status=Claim.Status.UNVERIFIED).count(),
            'clusters': NarrativeCluster.objects.count(),
            'high_priority': claims.filter(priority__in=[Claim.Priority.HIGH, Claim.Priority.CRITICAL]).count(),
            'validated': ValidatedClaim.objects.filter(is_active=True).count(),
        })


class ClaimListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Claim.objects.all()
        language = (request.query_params.get('language') or '').strip()
        status_filter = (request.query_params.get('status') or '').strip()
        query = (request.query_params.get('q') or '').strip()
        cluster = (request.query_params.get('cluster') or '').strip()
        if language and language != 'All':
            if language == 'Bangla':
                qs = qs.filter(language__in=['বাংলা', 'Bangla'])
            else:
                qs = qs.filter(language__iexact=language)
        if status_filter and status_filter != 'All':
            if status_filter == 'Unreviewed':
                qs = qs.filter(status=Claim.Status.UNVERIFIED)
            elif status_filter == 'Media':
                qs = qs.filter(
                    Q(intake_kind='media') | ~Q(media_type='')
                    | Q(source__icontains='image')
                    | Q(source__icontains='video')
                    | Q(source__icontains='audio')
                )
            elif status_filter == 'High':
                qs = qs.filter(priority__in=[Claim.Priority.HIGH, Claim.Priority.CRITICAL])
            else:
                qs = qs.filter(status__iexact=status_filter)
        if query:
            qs = qs.filter(
                Q(claim_id__icontains=query)
                | Q(text__icontains=query)
                | Q(cluster__icontains=query)
                | Q(source__icontains=query)
                | Q(url__icontains=query)
            )
        if cluster:
            qs = qs.filter(cluster=cluster)
        return paginate(qs, request, serializer_fn=serialize_claims)


class ClaimDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(serialize_claim(get_object_or_404(Claim, pk=pk)))

    def patch(self, request, pk):
        claim = get_object_or_404(Claim, pk=pk)
        allowed = {'priority', 'status', 'analyst', 'evidence', 'notes', 'cluster'}
        for key in allowed:
            if key in request.data:
                setattr(claim, key, request.data[key])
        if request.data.get('assign_me'):
            claim.analyst = operator_name(request.user)
            claim.assigned_to = request.user
            claim.workflow_stage = 'verification'
        claim.save()
        return Response(serialize_claim(claim))


class ClaimByIdView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, claim_id):
        claim = get_object_or_404(Claim, claim_id=claim_id)
        hit = match_validated(claim)
        payload = serialize_claim(claim)
        from .workflow import recorded_evidence_for
        payload['evidence_items'] = recorded_evidence_for(claim)
        assessment_id = request.query_params.get('assessment')
        latest = (get_object_or_404(claim.assessments, pk=assessment_id)
                  if assessment_id and assessment_id.isdigit() else claim.assessments.first())
        payload['latest_assessment'] = AssessmentSerializer(latest).data if latest else None
        return Response(payload)


class IntakeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data or {}
        kind = (data.get('source_kind') or data.get('intake_kind') or 'text').lower()
        if request.FILES.get('file'):
            from .intake import ingest_media
            return ingest_media(request)
        text = (data.get('text') or data.get('description') or '').strip()
        url = (data.get('url') or data.get('source_url') or '').strip()
        if kind == 'url' and url and not text:
            text = url
        if not text and not url:
            return Response({'detail': 'Provide a public URL or claim text.'}, status=status.HTTP_400_BAD_REQUEST)
        source = data.get('source') or (f"{data.get('platform')} · public source" if data.get('platform') else 'Authorized public intake')
        priority = data.get('priority')
        if priority and priority not in Claim.Priority.values:
            priority = triage_priority(text or url)
        created, duplicates = ingest_text(
            text or url,
            source=source,
            url=url,
            platform=data.get('platform') or '',
            notes=data.get('notes') or '',
            user=request.user,
            intake_kind=kind if kind in ('url', 'text', 'media') else 'text',
            priority=priority,
        )
        from .workflow import record_case
        for claim in [*created, *duplicates]:
            from .evidence import media_kind
            from urllib.parse import urlparse
            detected_media = media_kind(urlparse(claim.url).path)
            if detected_media and not claim.media_type:
                claim.media_type = detected_media
                claim.save(update_fields=['media_type'])
            record_case(claim, request.user, 'intake', 'Submission entered Rumor Scanner.')
        return Response({
            'created': serialize_claims(created),
            'duplicates': serialize_claims(duplicates),
            'created_count': len(created),
            'duplicate_count': len(duplicates),
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ExtractView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        created, duplicates = extract_from_existing()
        return Response({
            'created': serialize_claims(created),
            'duplicates': len(duplicates),
            'created_count': len(created),
        })


class ScanView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(scan_sources())


class ClusterRefreshView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        clusters = rebuild_clusters()
        return Response(NarrativeClusterSerializer(clusters, many=True).data)


class AssessView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        claim = get_object_or_404(Claim, pk=pk)
        assessment = apply_assessment(
            claim,
            verdict=request.data.get('verdict') or request.data.get('status') or 'Unverified',
            confidence=request.data.get('confidence') or 0,
            notes=request.data.get('notes') or '',
            user=request.user,
            promote=bool(request.data.get('promote')),
        )
        payload = serialize_claim(claim)
        payload['assessment'] = AssessmentSerializer(assessment).data
        from .workflow import execute_stage
        execute_stage(claim, 'narrative', request.user)
        return Response(payload)


class ValidatedClaimListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = ValidatedClaim.objects.all()
        if request.query_params.get('active') == '1':
            qs = qs.filter(is_active=True)
        query = (request.query_params.get('q') or '').strip()
        if query:
            qs = qs.filter(
                Q(claim_id__icontains=query)
                | Q(text__icontains=query)
                | Q(topic__icontains=query)
                | Q(authority__icontains=query)
            )
        response = paginate(qs, request, ValidatedClaimSerializer)
        response.data['healthy'] = True
        response.data['source'] = 'rumor-internal-validated-claims'
        return response

    def post(self, request):
        serializer = ValidatedClaimSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ValidatedClaimDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(ValidatedClaimSerializer(get_object_or_404(ValidatedClaim, pk=pk)).data)

    def patch(self, request, pk):
        claim = get_object_or_404(ValidatedClaim, pk=pk)
        serializer = ValidatedClaimSerializer(claim, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SourceFeedListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return paginate(SourceFeed.objects.filter(is_active=True), request, SourceFeedSerializer)


class NarrativeClusterListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return paginate(NarrativeCluster.objects.all(), request, NarrativeClusterSerializer)


class AlertAnalysisView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, key=None):
        chosen = key or request.query_params.get('alert') or ''
        return Response(build_alert_analysis(chosen.strip() or None, operator=operator_name(request.user)))


class AlertAssignView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, key):
        operator = operator_name(request.user)
        payload = build_alert_analysis(key, operator=operator)
        if not payload.get('selected'):
            return Response({'detail': 'Alert is no longer active.'}, status=status.HTTP_404_NOT_FOUND)
        assign_alert(key, operator)
        return Response(build_alert_analysis(key, operator=operator))


class NarrativeAnalysisView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug=None):
        chosen = slug or request.query_params.get('cluster') or ''
        claim_id = request.query_params.get('claim_id')
        claim = get_object_or_404(Claim, claim_id=claim_id) if claim_id else None
        if claim:
            chosen = claim.cluster
        payload = build_narrative_analysis(chosen.strip() or None)
        if claim and not claim.cluster:
            payload['selected'] = None
        return Response(payload)
