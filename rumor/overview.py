from collections import Counter
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import Count, OuterRef, Subquery
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cases.models import CaseEvent, InvestigationCase
from .models import AnalysisRun, Claim, CouncilRun, IntelligenceReport, ReportEvent
from .services import build_alert_analysis, operator_name


class IntelligenceOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            days = int(request.query_params.get('days', 7))
        except (ValueError, TypeError):
            days = 0
        if days not in (1, 7, 30):
            return Response({'detail': 'Choose a 1, 7, or 30 day window.'}, status=400)
        zone = ZoneInfo('Asia/Dhaka')
        now = timezone.now()
        today = now.astimezone(zone).date()
        start_date = today - timedelta(days=days-1)
        start = timezone.make_aware(timezone.datetime.combine(start_date, timezone.datetime.min.time()), zone)
        claims = Claim.objects.all()
        alerts = build_alert_analysis(operator=operator_name(request.user))
        queue = claims.filter(status=Claim.Status.UNVERIFIED).order_by('-review_score', '-created_at', '-id')[:5]
        latest_analysis = AnalysisRun.objects.filter(claim_id=OuterRef('claim_id'), kind=OuterRef('kind')).order_by('-created_at', '-pk').values('pk')[:1]
        attention = AnalysisRun.objects.filter(pk=Subquery(latest_analysis), status__in=['failed', 'needs_configuration']).select_related('claim')
        intake = {
            row['day']: row['count'] for row in claims.filter(created_at__gte=start, created_at__lte=now)
            .annotate(day=TruncDate('created_at', tzinfo=zone)).values('day').annotate(count=Count('pk'))
        }
        stage_counts = Counter(dict(claims.values_list('workflow_stage').annotate(count=Count('pk'))))
        stages = [('intake', 'Intake'), ('verification', 'Verification'), ('forensic', 'Media forensics'),
                  ('narrative', 'Narrative analysis'), ('report_ready', 'Ready for reporting')]
        classifications = list(claims.values('status').annotate(value=Count('pk')).order_by('status'))
        events = []
        for event in CaseEvent.objects.filter(created_at__gte=start, created_at__lte=now).select_related('case')[:8]:
            events.append({'id': f'case-{event.pk}', 'title': event.action.replace('_', ' ').title(),
                           'reference': event.case.case_number, 'actor': event.actor_name,
                           'created_at': event.created_at, 'path': f'/cases?case={event.case.case_number}'})
        for event in ReportEvent.objects.filter(created_at__gte=start, created_at__lte=now).select_related('report')[:8]:
            events.append({'id': f'report-{event.pk}', 'title': event.action.replace('_', ' ').title(),
                           'reference': f'Report #{event.report_id}', 'actor': event.actor,
                           'created_at': event.created_at, 'path': f'/reports?report={event.report_id}'})
        events.sort(key=lambda row: row['created_at'], reverse=True)
        return Response({
            'generated_at': now, 'days': days, 'timezone': 'Asia/Dhaka',
            'totals': {
                'claims': claims.count(), 'unverified': claims.filter(status=Claim.Status.UNVERIFIED).count(),
                'unassigned': claims.filter(status=Claim.Status.UNVERIFIED, assigned_to__isnull=True, handling_mode='analyst').count(),
                'active_cases': InvestigationCase.objects.exclude(state__in=['CLOSED', 'PUBLISHED']).count(),
                'high_priority_alerts': sum(row['sev'] in ('high', 'critical') for row in alerts['alerts']),
                'draft_reports': IntelligenceReport.objects.filter(status='draft').count(),
                'pending_reports': IntelligenceReport.objects.filter(status='pending').count(),
                'council_runs': CouncilRun.objects.count(), 'analysis_attention': attention.count(),
            },
            'stages': [{'key': key, 'label': label, 'count': stage_counts[key]} for key, label in stages],
            'intake': [{'date': (start_date+timedelta(days=i)).isoformat(),
                        'label': (start_date+timedelta(days=i)).strftime('%d %b'),
                        'claims': intake.get(start_date+timedelta(days=i), 0)} for i in range(days)],
            'classifications': [{'name': row['status'], 'value': row['value']} for row in classifications],
            'queue': [{'claim_id': row.claim_id, 'text': row.text, 'priority': row.priority,
                       'analyst': row.analyst, 'stage': row.workflow_stage,
                       'media_type': row.media_type, 'created_at': row.created_at} for row in queue],
            'alerts': alerts['alerts'][:5],
            'attention': [{'id': row.pk, 'claim_id': row.claim.claim_id, 'kind': row.kind,
                           'status': row.status, 'error': row.error} for row in attention[:5]],
            'reports': list(IntelligenceReport.objects.order_by('-updated_at', '-pk').values('id', 'title', 'status', 'version')[:4]),
            'activity': events[:6],
            'providers': {
                'openai': {'ready': bool(settings.OPENAI_API_KEY and settings.OPENAI_MODEL), 'model': settings.OPENAI_MODEL},
                'forensic': {'ready': bool(settings.FORENSIC_SERVICE_URL)},
            },
        })
