from datetime import datetime, timezone as dt_timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from cases.models import InvestigationCase
from .models import AnalysisRun, Claim, IntelligenceReport


@override_settings(OPENAI_API_KEY='private-test-key', OPENAI_MODEL='test-model', FORENSIC_SERVICE_URL='')
@patch('rumor.overview.build_alert_analysis', return_value={'alerts': []})
class OverviewTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='overview-analyst')
        self.client.force_authenticate(self.user)

    def claim(self, claim_id, **fields):
        return Claim.objects.create(claim_id=claim_id, text='A statement for review', language='English',
                                    source='Public source', first_seen=timezone.now(), **fields)

    def test_empty_overview_has_zero_counts_and_no_credentials(self, alerts):
        response = self.client.get('/api/rumor/intelligence-overview/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['totals']['claims'], 0)
        self.assertEqual(len(response.data['intake']), 7)
        self.assertTrue(all(row['claims'] == 0 for row in response.data['intake']))
        self.assertEqual(response.data['classifications'], [])
        self.assertTrue(response.data['providers']['openai']['ready'])
        self.assertFalse(response.data['providers']['forensic']['ready'])
        self.assertNotIn('private-test-key', str(response.data))

    def test_counts_stages_and_latest_analysis_attention(self, alerts):
        one = self.claim('CL-ONE', workflow_stage='verification')
        self.claim('CL-TWO', status='Supported', handling_mode='council', workflow_stage='report_ready')
        self.claim('CL-THREE', assigned_to=self.user, workflow_stage='forensic')
        AnalysisRun.objects.create(claim=one, kind='verification', status='failed', error='Old failure')
        AnalysisRun.objects.create(claim=one, kind='verification', status='completed')
        AnalysisRun.objects.create(claim=one, kind='forensic', status='needs_configuration', error='Configure service')
        for number, state in [('INV-1', 'IN_ANALYSIS'), ('INV-2', 'PUBLISHED'), ('INV-3', 'CLOSED')]:
            InvestigationCase.objects.create(case_number=number, title=number, state=state)
        IntelligenceReport.objects.create(title='Draft', status='draft')
        IntelligenceReport.objects.create(title='Review', status='pending')
        response = self.client.get('/api/rumor/intelligence-overview/').data
        self.assertEqual(response['totals']['claims'], 3)
        self.assertEqual(response['totals']['unverified'], 2)
        self.assertEqual(response['totals']['unassigned'], 1)
        self.assertEqual(response['totals']['active_cases'], 1)
        self.assertEqual(response['totals']['draft_reports'], 1)
        self.assertEqual(response['totals']['pending_reports'], 1)
        self.assertEqual(response['totals']['analysis_attention'], 1)
        self.assertEqual(response['attention'][0]['error'], 'Configure service')
        self.assertEqual(sum(row['count'] for row in response['stages']), 3)
        self.assertEqual(sum(row['value'] for row in response['classifications']), 3)

    def test_calendar_window_uses_dhaka_midnight(self, alerts):
        now = datetime(2026, 10, 17, 12, tzinfo=dt_timezone.utc)
        included = self.claim('CL-IN')
        excluded = self.claim('CL-OUT')
        Claim.objects.filter(pk=included.pk).update(created_at=datetime(2026, 10, 16, 18, tzinfo=dt_timezone.utc))
        Claim.objects.filter(pk=excluded.pk).update(created_at=datetime(2026, 10, 16, 17, 59, tzinfo=dt_timezone.utc))
        with patch('rumor.overview.timezone.now', return_value=now):
            response = self.client.get('/api/rumor/intelligence-overview/?days=1').data
        self.assertEqual(response['intake'], [{'date': '2026-10-17', 'label': '17 Oct', 'claims': 1}])
        self.assertEqual(response['totals']['claims'], 2)

    def test_authentication_and_window_validation(self, alerts):
        self.assertEqual(self.client.get('/api/rumor/intelligence-overview/?days=invalid').status_code, 400)
        self.assertEqual(self.client.get('/api/rumor/intelligence-overview/?days=999').status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/rumor/intelligence-overview/').status_code, 401)
