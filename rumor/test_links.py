from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from cases.models import InvestigationCase
from .models import Claim, Evidence
from .test_workflow import FORENSIC, NARRATIVE, VERIFICATION


@override_settings(OPENAI_API_KEY='', OPENAI_MODEL='', STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'}})
class WorkspaceLinkTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='link-auditor')
        self.client.force_authenticate(self.user)

    @patch('rumor.providers.verify', return_value=VERIFICATION)
    @patch('rumor.providers.forensic', return_value=FORENSIC)
    @patch('rumor.providers.narrative', return_value=NARRATIVE)
    def test_submission_can_be_followed_through_all_workspaces(self, narrative, forensic, verify):
        intake = self.client.post('/api/rumor/intake/', {
            'file': SimpleUploadedFile('original.mp4', b'original video'), 'description': 'A rally occurred yesterday.'}, format='multipart')
        self.assertEqual(intake.status_code, 201)
        claim_id = intake.data['created'][0]['claim_id']
        claim = Claim.objects.get(claim_id=claim_id)
        case = claim.investigations.get()
        self.assertEqual(case.evidence_count, 1)
        scanner = self.client.get(f'/api/rumor/claims/?q={claim_id}')
        self.assertEqual(scanner.data['results'][0]['claim_id'], claim_id)
        self.assertEqual(self.client.post(f'/api/rumor/workflow/{claim_id}/assign/', {'user_id': self.user.pk}).status_code, 200)
        council = self.client.post('/api/rumor/council/', {'claim_id': claim_id})
        self.assertEqual(council.data['status'], 'completed')
        state = self.client.get(f'/api/rumor/workflow/{claim_id}/').data
        self.assertEqual(state['case'], case.case_number)
        self.assertEqual({row['kind'] for row in state['analyses']}, {'verification', 'forensic', 'narrative'})
        narrative_page = self.client.get(f'/api/rumor/narratives/?claim_id={claim_id}').data
        self.assertEqual(narrative_page['selected']['slug'], 'rally-context')
        alert = self.client.get(f'/api/rumor/alerts/{state["alert"]["id"]}/')
        self.assertEqual(alert.data['selected']['claim_id'], claim_id)
        report = self.client.get(f'/api/rumor/reports/{state["report_id"]}/').data
        self.assertEqual(report['case_reference'], case.case_number)
        self.assertEqual(report['source_snapshot']['claims'][0]['claim_id'], claim_id)
        evidence_id = report['source_snapshot']['evidence'][0]['id']
        for query in [f'id={evidence_id}', f'claim_id={claim_id}', f'case_reference={case.case_number}']:
            evidence = self.client.get(f'/api/rumor/evidence/?{query}')
            self.assertEqual(len(evidence.data['results']), 1)
            self.assertEqual(evidence.data['results'][0]['claim_id'], claim_id)
        self.assertEqual(self.client.get(f'/api/rumor/evidence/{evidence_id}/').data['claim_id'], claim_id)
        case_page = self.client.get(f'/api/cases/by-number/{case.case_number}/')
        self.assertEqual(case_page.data['claim_id'], claim_id)

    def test_repository_upload_infers_existing_case_claim(self):
        claim = Claim.objects.create(claim_id='CL-LINK', text='Original claim', language='English', source='Source', first_seen=timezone.now())
        case = InvestigationCase.objects.create(case_number='INV-LINK', title='Investigation', claim=claim)
        response = self.client.post('/api/rumor/evidence/', {
            'file': SimpleUploadedFile('record.wav', b'original recording'), 'case_reference': case.case_number}, format='multipart')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['claim_id'], claim.claim_id)
        self.assertEqual(claim.investigations.count(), 1)
        case.refresh_from_db()
        self.assertEqual(case.evidence_count, 1)
        other = Claim.objects.create(claim_id='CL-OTHER', text='Other claim', language='English', source='Source', first_seen=timezone.now())
        conflict = self.client.post('/api/rumor/evidence/', {
            'file': SimpleUploadedFile('wrong.wav', b'data'), 'claim_id': other.claim_id, 'case_reference': case.case_number}, format='multipart')
        self.assertEqual(conflict.status_code, 400)
        self.assertEqual(Evidence.objects.count(), 1)

    def test_unclustered_claim_does_not_open_an_unrelated_narrative(self):
        Claim.objects.create(claim_id='CL-NONE', text='Unclustered statement', language='English', source='Source', first_seen=timezone.now())
        Claim.objects.create(claim_id='CL-CLUSTER', text='Clustered statement', cluster='other-topic', language='English', source='Source', first_seen=timezone.now())
        response = self.client.get('/api/rumor/narratives/?claim_id=CL-NONE')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['selected'])
        self.assertEqual(self.client.get('/api/rumor/narratives/?claim_id=missing').status_code, 404)
