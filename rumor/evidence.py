import hashlib
import uuid
import mimetypes
from pathlib import Path

from django.db import transaction
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Claim, Evidence, EvidenceEvent


def media_kind(name):
    mime = mimetypes.guess_type(name)[0] or ''
    prefix = mime.split('/')[0]
    return prefix if prefix in ('image', 'video', 'audio') else ''


def actor(request):
    return request.user.get_username()


def digest(file):
    result = hashlib.sha256()
    for chunk in file.chunks():
        result.update(chunk)
    return result.hexdigest()


class EvidenceSerializer(serializers.ModelSerializer):
    claim_id = serializers.CharField(source='claim.claim_id', read_only=True, default=None)
    evidence_id = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()

    class Meta:
        model = Evidence
        exclude = ['file']
        read_only_fields = ['name', 'size', 'sha256', 'integrity', 'uploaded_by', 'created_at', 'verified_at', 'claim', 'media_type']

    def get_evidence_id(self, obj):
        return f'EV-{obj.pk:06d}'

    def get_events(self, obj):
        return list(obj.events.values('id', 'action', 'actor', 'detail', 'created_at'))


class EvidenceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = Evidence.objects.prefetch_related('events')
        if request.query_params.get('claim_id'):
            rows = rows.filter(claim__claim_id=request.query_params['claim_id'])
        if request.query_params.get('case_reference'):
            reference = request.query_params['case_reference']
            rows = rows.filter(Q(case_reference=reference) | Q(claim__investigations__case_number=reference)).distinct()
        evidence_id = request.query_params.get('id')
        if evidence_id:
            if not evidence_id.isdigit():
                raise ValidationError('Evidence ID must be a number.')
            rows = rows.filter(pk=evidence_id)
        query = request.query_params.get('q', '').strip()
        if query:
            match = Q(name__icontains=query) | Q(case_reference__icontains=query) | Q(sha256__icontains=query)
            number = query.upper().removeprefix('EV-')
            if number.isdigit():
                match |= Q(pk=int(number))
            rows = rows.filter(match)
        all_rows = Evidence.objects.all()
        return Response({'results': EvidenceSerializer(rows, many=True).data, 'stats': {
            'total': all_rows.count(), 'mismatches': all_rows.exclude(integrity='Verified').count(),
            'today': all_rows.filter(created_at__date=timezone.localdate()).count(),
            'holds': all_rows.filter(retention_hold=True).count(),
        }})

    def post(self, request):
        file = request.FILES.get('file')
        if not file or file.size == 0:
            raise ValidationError({'file': 'Choose a non-empty file.'})
        if file.size > 500 * 1024 * 1024:
            raise ValidationError({'file': 'Maximum file size is 500 MB.'})
        serializer = EvidenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        checksum = digest(file)
        file.seek(0)
        name = Path(file.name.replace('\\', '/')).name[:255]
        kind = media_kind(name)
        claim_id = request.data.get('claim_id')
        claim = get_object_or_404(Claim, claim_id=claim_id) if claim_id else None
        reference = serializer.validated_data.get('case_reference', '')
        if reference:
            from cases.models import InvestigationCase
            linked_case = InvestigationCase.objects.filter(case_number=reference).first()
            if linked_case and linked_case.claim_id:
                if claim and linked_case.claim_id != claim.pk:
                    raise ValidationError('The case reference belongs to a different claim.')
                claim = linked_case.claim
        file.name = uuid.uuid4().hex
        obj = None
        try:
            with transaction.atomic():
                obj = serializer.save(file=file, name=name, size=file.size, sha256=checksum,
                                      uploaded_by=request.user, verified_at=timezone.now(), claim=claim, media_type=kind)
                EvidenceEvent.objects.create(evidence=obj, action='Collected', actor=actor(request), detail='Original stored; SHA-256 calculated.')
                if claim:
                    from .workflow import record_case
                    case = record_case(claim, request.user, 'evidence_added', f'Evidence EV-{obj.pk:06d}: {obj.name}')
                    if not obj.case_reference:
                        obj.case_reference = case.case_number
                        obj.save(update_fields=['case_reference'])
                    if kind:
                        claim.media_type = kind
                    claim.workflow_stage = 'verification'
                    claim.save(update_fields=['media_type', 'workflow_stage'])
                    case.evidence_count = Evidence.objects.filter(Q(claim=claim) | Q(case_reference=case.case_number)).count()
                    case.save(update_fields=['evidence_count', 'updated_at'])
        except Exception:
            if obj and obj.file:
                obj.file.delete(save=False)
            raise
        return Response(EvidenceSerializer(obj).data, status=201)


class EvidenceDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(EvidenceSerializer(get_object_or_404(Evidence, pk=pk)).data)

    def patch(self, request, pk):
        obj = get_object_or_404(Evidence, pk=pk)
        allowed = {'case_reference', 'source_url', 'notes', 'retention_hold'}
        if set(request.data) - allowed:
            raise ValidationError('Only case reference, source URL, notes, and retention hold may be changed.')
        with transaction.atomic():
            serializer = EvidenceSerializer(obj, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            EvidenceEvent.objects.create(evidence=obj, action='Metadata updated', actor=actor(request), detail=', '.join(request.data.keys()))
        return Response(EvidenceSerializer(obj).data)


class EvidenceVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        obj = get_object_or_404(Evidence, pk=pk)
        try:
            with obj.file.open('rb') as file:
                valid = digest(file) == obj.sha256
            obj.integrity = 'Verified' if valid else 'Mismatch'
        except (OSError, FileNotFoundError):
            obj.integrity = 'Missing'
        with transaction.atomic():
            obj.verified_at = timezone.now()
            obj.save(update_fields=['integrity', 'verified_at'])
            EvidenceEvent.objects.create(evidence=obj, action='Integrity checked', actor=actor(request), detail=obj.integrity)
        return Response(EvidenceSerializer(obj).data)


class EvidenceDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        obj = get_object_or_404(Evidence, pk=pk)
        try:
            file = obj.file.open('rb')
        except (OSError, FileNotFoundError):
            return Response({'detail': 'Original file is unavailable.'}, status=404)
        EvidenceEvent.objects.create(evidence=obj, action='Downloaded', actor=actor(request))
        response = FileResponse(file, as_attachment=True, filename=obj.name, content_type='application/octet-stream')
        response['X-Content-Type-Options'] = 'nosniff'
        return response
