from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Assessment, Claim, CouncilRun, ValidatedClaim


@override_settings(OPENAI_API_KEY='', OPENAI_MODEL='')
class CouncilTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='council-analyst')
        self.client.force_authenticate(self.user)
        self.claim = Claim.objects.create(
            claim_id='CL-COUNCIL', text='A public post claims an election rally occurred yesterday.',
            language='English', source='Public post', first_seen=timezone.now(),
        )

    def start(self):
        return self.client.post('/api/rumor/council/', {'claim_id': self.claim.claim_id})

    @patch('rumor.providers.verify', return_value={'summary': 'Verification draft', 'claims': ['A public claim'], 'verdict': 'Unverified', 'confidence': 0, 'gaps': [], 'citations': []})
    @patch('rumor.providers.narrative', return_value={'summary': 'Narrative draft', 'label': 'election-rally', 'alarming': False, 'severity': 'low', 'reasons': [], 'gaps': []})
    def test_persisted_run_history_and_idempotent_draft(self, narrative, verify):
        response = self.start()
        self.assertEqual(response.status_code, 201)
        run = response.data
        self.assertEqual(run['status'], 'completed')
        self.assertEqual(len(run['agents']), 6)
        self.assertIn('Verification draft', run['draft'])
        self.claim.text = 'Changed after analysis'
        self.claim.save()
        history = self.client.get('/api/rumor/council/?claim_id=CL-COUNCIL')
        self.assertEqual(history.data['count'], 1)
        self.assertIn('election rally', history.data['results'][0]['snapshot']['text'])
        path = f'/api/rumor/council/{run["id"]}/accept/'
        first = self.client.post(path)
        second = self.client.post(path)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['assessment'], second.data['assessment'])
        self.assertEqual(Assessment.objects.count(), 1)
        from cases.models import CaseEvent
        self.assertIsNotNone(first.data['case'])
        self.assertEqual(CaseEvent.objects.filter(action='council_draft').count(), 1)
        assessment = Assessment.objects.get()
        self.assertEqual(assessment.stage, Assessment.Stage.ANALYST)
        self.assertEqual(assessment.verdict, Claim.Status.UNVERIFIED)
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.status, Claim.Status.UNVERIFIED)
        detail = self.client.get(f'/api/rumor/claims/by-id/CL-COUNCIL/?assessment={assessment.pk}')
        self.assertEqual(detail.data['latest_assessment']['notes'], run['draft'])

    def test_validation_and_authentication(self):
        self.assertEqual(self.client.post('/api/rumor/council/', {}).status_code, 400)
        self.assertEqual(self.client.post('/api/rumor/council/', {'claim_id': 'missing'}).status_code, 404)
        self.assertEqual(CouncilRun.objects.count(), 0)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/rumor/council/').status_code, 401)
        self.assertEqual(self.start().status_code, 401)
        self.assertEqual(self.client.post('/api/rumor/council/1/accept/').status_code, 401)

    def test_missing_provider_is_not_reported_as_completed(self):
        run = self.start().data
        self.assertEqual(run['status'], 'needs_configuration')
        self.assertIn('OPENAI_API_KEY', run['error'])
        self.assertEqual(self.client.post(f'/api/rumor/council/{run["id"]}/accept/').status_code, 400)

    @patch('rumor.council.analyze', side_effect=RuntimeError('provider error'))
    def test_failure_recorded_and_not_acceptable(self, analyze):
        with self.assertLogs('rumor.council', level='ERROR'):
            response = self.start()
        self.assertEqual(response.data['status'], 'failed')
        self.assertNotIn('provider error', response.data['error'])
        self.assertEqual(self.client.post(f'/api/rumor/council/{response.data["id"]}/accept/').status_code, 400)
        self.assertEqual(Assessment.objects.count(), 0)
