from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from rumor.models import Claim

from .models import InvestigationCase


class CaseApiTests(APITestCase):
    def setUp(self):
        user = get_user_model().objects.create_user('a.rahman', password='x')
        token = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

    def test_lifecycle_and_blocked_transition(self):
        created = self.client.post('/api/cases/', {'title': 'Test case', 'priority': 'High'}, format='json')
        self.assertEqual(created.status_code, 201)
        pk = created.data['id']
        self.assertEqual(created.data['state'], InvestigationCase.State.NEW)
        self.assertTrue(created.data['case_number'].startswith('INV-'))

        triaged = self.client.post(f'/api/cases/{pk}/transition/', {'action': 'triage'}, format='json')
        self.assertEqual(triaged.status_code, 200)
        self.assertEqual(triaged.data['state'], InvestigationCase.State.TRIAGED)

        blocked = self.client.post(f'/api/cases/{pk}/transition/', {'action': 'publish'}, format='json')
        self.assertEqual(blocked.status_code, 400)

        assigned = self.client.post(f'/api/cases/{pk}/transition/', {'action': 'assign'}, format='json')
        self.assertEqual(assigned.status_code, 200)
        self.assertEqual(assigned.data['assignee_name'], 'a.rahman')

    def test_open_from_claim_is_idempotent(self):
        Claim.objects.create(
            claim_id='CL-TEST-1',
            text='A public claim used to open an investigation.',
            language='English',
            source='Test source',
            first_seen='2026-01-01T00:00:00Z',
            priority='High',
            match_count=4,
        )
        first = self.client.post('/api/cases/open/', {'claim_id': 'CL-TEST-1'}, format='json')
        second = self.client.post('/api/cases/open/', {'claim_id': 'CL-TEST-1'}, format='json')
        self.assertEqual(first.status_code, 201)
        self.assertTrue(first.data['created'])
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data['created'])
        self.assertEqual(first.data['case_number'], second.data['case_number'])
        self.assertEqual(InvestigationCase.objects.filter(claim__claim_id='CL-TEST-1').count(), 1)

    def test_overview_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/cases/overview/')
        self.assertEqual(response.status_code, 401)
