"""Versioned internal intelligence products built from recorded source data."""
import json

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Claim, Evidence, IntelligenceReport, ReportEvent, ReportRevision

CONTENT = ('title', 'language', 'summary', 'findings', 'recommendations', 'case_reference')


def reviewer(user):
    return user.is_staff or user.has_perm('rumor.review_intelligencereport')


def can_edit(user, obj):
    return obj.created_by_id == user.pk or reviewer(user)


def snapshot(obj):
    return {**{key: getattr(obj, key) for key in CONTENT}, 'source_snapshot': obj.source_snapshot}


def revision(obj, user):
    ReportRevision.objects.create(report=obj, version=obj.version, snapshot=snapshot(obj), actor=user.get_username())


def event(obj, user, action, note=''):
    ReportEvent.objects.create(report=obj, action=action, actor=user.get_username(), note=note)


class ContentSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntelligenceReport
        fields = CONTENT


class CreateSerializer(ContentSerializer):
    claim_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False, max_length=100)
    evidence_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, default=list, max_length=100)

    class Meta(ContentSerializer.Meta):
        fields = (*CONTENT, 'claim_ids', 'evidence_ids')


class ReportSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    revisions = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()

    class Meta:
        model = IntelligenceReport
        fields = '__all__'

    def get_author(self, obj):
        return obj.created_by.get_username() if obj.created_by else 'Former operator'

    def get_can_edit(self, obj):
        return can_edit(self.context['request'].user, obj)

    def get_revisions(self, obj):
        return list(obj.revisions.values('version', 'snapshot', 'actor', 'created_at'))

    def get_events(self, obj):
        return list(obj.events.values('id', 'action', 'actor', 'note', 'created_at'))


def payload(obj, request):
    return ReportSerializer(obj, context={'request': request}).data


class ReportListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = IntelligenceReport.objects.select_related('created_by').prefetch_related('revisions', 'events')
        query = request.query_params.get('q', '').strip()
        if query:
            rows = rows.filter(Q(title__icontains=query) | Q(case_reference__icontains=query))
        state = request.query_params.get('status')
        if state:
            rows = rows.filter(status=state)
        all_rows = IntelligenceReport.objects.all()
        now = timezone.now()
        return Response({'results': ReportSerializer(rows, many=True, context={'request': request}).data,
            'can_review': reviewer(request.user), 'stats': {
                'total': all_rows.count(), 'pending': all_rows.filter(status='pending').count(),
                'draft': all_rows.filter(status='draft').count(),
                'published_month': all_rows.filter(status='published', published_at__year=now.year, published_at__month=now.month).count(),
            }})

    def post(self, request):
        serializer = CreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        claim_ids = set(data.pop('claim_ids'))
        evidence_ids = set(data.pop('evidence_ids'))
        claims = list(Claim.objects.filter(pk__in=claim_ids).prefetch_related('assessments'))
        evidence = list(Evidence.objects.filter(pk__in=evidence_ids))
        if len(claims) != len(claim_ids) or len(evidence) != len(evidence_ids):
            raise ValidationError('A selected claim or evidence object no longer exists.')
        sources = {'captured_at': timezone.now().isoformat(), 'claims': [], 'evidence': []}
        for claim in claims:
            sources['claims'].append({
                'id': claim.pk, 'claim_id': claim.claim_id, 'text': claim.text, 'status': claim.status,
                'source': claim.source, 'url': claim.url, 'evidence': claim.evidence,
                'assessments': list(claim.assessments.values('verdict', 'confidence', 'notes', 'analyst', 'stage')),
            })
        sources['evidence'] = [{'id': obj.pk, 'name': obj.name, 'sha256': obj.sha256,
            'integrity': obj.integrity, 'case_reference': obj.case_reference, 'source_url': obj.source_url} for obj in evidence]
        data.setdefault('summary', '\n'.join(f"{c.claim_id}: {c.text}" for c in claims))
        data.setdefault('findings', '\n\n'.join(f"{c.claim_id} ? {c.status}\nRecorded evidence: {c.evidence or 'None recorded.'}" for c in claims))
        data.setdefault('recommendations', 'Review recorded sources and evidence gaps before approval.')
        with transaction.atomic():
            obj = IntelligenceReport.objects.create(**data, source_snapshot=sources, created_by=request.user)
            revision(obj, request.user)
            event(obj, request.user, 'Created')
        return Response(payload(obj, request), status=201)


class ReportDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(payload(get_object_or_404(IntelligenceReport, pk=pk), request))

    def patch(self, request, pk):
        if set(request.data) - {*CONTENT, 'version'}:
            raise ValidationError('Only report content may be edited.')
        with transaction.atomic():
            obj = get_object_or_404(IntelligenceReport.objects.select_for_update(), pk=pk)
            if not can_edit(request.user, obj):
                raise PermissionDenied('Only the author or a reviewer may edit this report.')
            if obj.status != 'draft':
                raise ValidationError('Request revision before editing a reviewed report.')
            if request.data.get('version') != obj.version:
                return Response({'detail': 'Report changed. Reload before saving.'}, status=409)
            serializer = ContentSerializer(obj, data={k: v for k, v in request.data.items() if k in CONTENT}, partial=True)
            serializer.is_valid(raise_exception=True)
            obj = serializer.save(version=obj.version + 1)
            revision(obj, request.user)
            event(obj, request.user, 'Draft saved')
        return Response(payload(obj, request))


class ReportActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        action = request.data.get('action')
        transitions = {'submit': ('draft', 'pending'), 'approve': ('pending', 'approved'), 'publish': ('approved', 'published')}
        note = request.data.get('note', '')
        if not isinstance(note, str) or len(note) > 10000:
            raise ValidationError('Review note must be text up to 10,000 characters.')
        with transaction.atomic():
            obj = get_object_or_404(IntelligenceReport.objects.select_for_update(), pk=pk)
            if request.data.get('version') != obj.version:
                return Response({'detail': 'Report changed. Reload before continuing.'}, status=409)
            if action == 'submit':
                if not can_edit(request.user, obj):
                    raise PermissionDenied()
            elif not reviewer(request.user):
                raise PermissionDenied('Reviewer permission is required.')
            if action == 'request_revision':
                if obj.status not in ('pending', 'approved', 'published') or not note.strip():
                    raise ValidationError('A review note and a reviewed report are required.')
                obj.status = 'draft'
                obj.version += 1
                revision(obj, request.user)
            elif action in transitions:
                before, after = transitions[action]
                if obj.status != before:
                    raise ValidationError(f'Cannot {action} a {obj.status} report.')
                obj.status = after
                if action == 'publish':
                    obj.published_at = timezone.now()
            else:
                raise ValidationError('Unknown report action.')
            obj.save()
            event(obj, request.user, action, note)
        return Response(payload(obj, request))


class ReportExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        obj = get_object_or_404(IntelligenceReport, pk=pk)
        data = { 'report_id': obj.pk, 'version': obj.version, 'status': obj.status,
            'author': obj.created_by.get_username() if obj.created_by else 'Former operator', **snapshot(obj) }
        if request.query_params.get('download') == 'txt':
            body = f"NARRATIVESHIELD ? INTELLIGENCE REPORT\nReport {obj.pk} ? v{obj.version} ? {obj.status.upper()}\n"
            body += '\n\n'.join(f'{key.replace("_", " ").title()}\n{getattr(obj, key)}' for key in CONTENT)
            body += '\n\nRecorded source snapshot\n' + json.dumps(obj.source_snapshot, ensure_ascii=False, indent=2)
            content_type, extension = 'text/plain; charset=utf-8', 'txt'
        else:
            body = json.dumps(data, ensure_ascii=False, indent=2)
            content_type, extension = 'application/json; charset=utf-8', 'json'
        event(obj, request.user, 'Exported', extension)
        response = HttpResponse(body, content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="report-{obj.pk}-v{obj.version}.{extension}"'
        response['Cache-Control'] = 'no-store'
        return response
