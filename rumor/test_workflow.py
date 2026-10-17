import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from . import providers
from .models import AnalysisRun, Claim, Evidence, IntelligenceReport, WorkflowAlert

VERIFICATION = {'summary': 'The claim needs corroboration.', 'claims': ['A rally occurred yesterday.'],
                'verdict': 'Unverified', 'confidence': 0, 'gaps': ['Event date unconfirmed'],
                'citations': [{'title': 'Archive', 'url': 'https://example.org/archive'}]}
NARRATIVE = {'summary': 'Review a potentially alarming narrative.', 'label': 'rally-context',
             'alarming': True, 'severity': 'high', 'reasons': ['Specific public-safety concern to review'], 'gaps': []}
FORENSIC = {'summary': 'Media examined with limitations.', 'findings': ['No decisive finding'],
            'limitations': ['Short clip'], 'model': 'test-detector-v1'}


@override_settings(OPENAI_API_KEY='', OPENAI_MODEL='', STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'}})
class WorkflowTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='intake-operator')
        self.analyst = get_user_model().objects.create_user(username='assigned-analyst')
        self.client.force_authenticate(self.user)
        self.claim = Claim.objects.create(claim_id='CL-WORKFLOW', text='A rally occurred yesterday.', language='English',
                                          source='Public post', first_seen=timezone.now())

    def run_stage(self, stage):
        return self.client.post('/api/rumor/workflow/CL-WORKFLOW/run/', {'stage': stage})

    def test_text_intake_creates_scanner_claim_and_case(self):
        result = self.client.post('/api/rumor/intake/', {'source_kind': 'text', 'text': 'An unrelated notice announces a new school calendar.'})
        self.assertEqual(result.status_code, 201)
        claim = Claim.objects.get(claim_id=result.data['created'][0]['claim_id'])
        self.assertTrue(claim.investigations.exists())

    def test_media_intake_links_scanner_original_and_case(self):
        result = self.client.post('/api/rumor/intake/', {
            'file': SimpleUploadedFile('clip.mp4', b'original-media', content_type='video/mp4'),
            'description': 'A rally occurred yesterday.', 'priority': 'High'}, format='multipart')
        self.assertEqual(result.status_code, 201)
        claim = Claim.objects.get(claim_id=result.data['created'][0]['claim_id'])
        self.assertEqual(claim.media_type, 'video')
        self.assertEqual(claim.originals.count(), 1)
        self.assertEqual(claim.originals.get().case_reference, claim.investigations.get().case_number)
        self.assertIn(claim.pk, [row['id'] for row in self.client.get('/api/rumor/claims/?status=Media').data['results']])

    def test_assignment_updates_claim_and_case(self):
        response = self.client.post('/api/rumor/workflow/CL-WORKFLOW/assign/', {'user_id': self.analyst.pk})
        self.assertEqual(response.status_code, 200)
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.assigned_to, self.analyst)
        self.assertEqual(self.claim.investigations.get().assignee, self.analyst)
        self.assertEqual(self.client.post('/api/rumor/workflow/CL-WORKFLOW/assign/', {'user_id': 99999}).status_code, 404)

    def test_missing_configuration_is_persisted_without_fake_results(self):
        response = self.run_stage('verification')
        run = response.data['analyses'][0]
        self.assertEqual(run['status'], 'needs_configuration')
        self.assertEqual(run['result'], {})
        self.assertFalse(WorkflowAlert.objects.exists())
        self.assertFalse(IntelligenceReport.objects.exists())

    @patch('rumor.providers.verify', return_value=VERIFICATION)
    @patch('rumor.providers.narrative', return_value=NARRATIVE)
    def test_council_pipeline_creates_alert_and_report_draft(self, narrative, verify):
        response = self.client.post('/api/rumor/council/', {'claim_id': self.claim.claim_id})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['status'], 'completed')
        self.assertTrue(WorkflowAlert.objects.get(claim=self.claim).is_active)
        alerts = self.client.get('/api/rumor/alerts/').data['alerts']
        self.assertTrue(any(row['id'] == f'WF-{self.claim.pk}' for row in alerts))
        self.assertEqual(IntelligenceReport.objects.get().status, 'draft')
        self.assertIn('analysis_runs', IntelligenceReport.objects.get().source_snapshot)
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.status, 'Unverified')
        self.assertEqual(self.claim.workflow_stage, 'report_ready')
        self.assertEqual(self.client.post('/api/rumor/workflow/CL-WORKFLOW/report/').data['report_id'], self.claim.generated_report_id)
        self.assertEqual(IntelligenceReport.objects.count(), 1)
        self.assertEqual(self.claim.investigations.get().state, 'ANALYST_REVIEW')
        self.assertEqual(IntelligenceReport.objects.get().source_snapshot['claims'][0]['claim_id'], self.claim.claim_id)

    @patch('rumor.providers.verify', return_value=VERIFICATION)
    def test_new_evidence_marks_results_old_and_preserves_prior_report(self, verify):
        self.run_stage('verification')
        first = self.client.post('/api/rumor/workflow/CL-WORKFLOW/report/').data['report_id']
        upload = self.client.post('/api/rumor/evidence/', {
            'file': SimpleUploadedFile('source.txt', b'additional evidence'), 'claim_id': self.claim.claim_id,
        }, format='multipart')
        self.assertEqual(upload.status_code, 201)
        state = self.client.get('/api/rumor/workflow/CL-WORKFLOW/').data
        self.assertFalse(state['analyses'][0]['current'])
        self.assertEqual(state['stage'], 'verification')
        second = self.client.post('/api/rumor/workflow/CL-WORKFLOW/report/').data['report_id']
        self.assertNotEqual(first, second)
        self.assertEqual(IntelligenceReport.objects.count(), 2)

    @patch('rumor.providers.verify', return_value=VERIFICATION)
    @patch('rumor.providers.forensic', return_value=FORENSIC)
    @patch('rumor.providers.narrative', return_value=NARRATIVE)
    def test_media_pipeline_and_added_evidence_share_same_case(self, narrative, forensic, verify):
        upload = self.client.post('/api/rumor/evidence/', {
            'file': SimpleUploadedFile('original.wav', b'audio-original'), 'claim_id': self.claim.claim_id,
            'notes': 'Original recording'}, format='multipart')
        self.assertEqual(upload.status_code, 201)
        self.assertEqual(Evidence.objects.get().claim, self.claim)
        response = self.run_stage('all')
        self.assertEqual({row['kind'] for row in response.data['analyses']}, {'verification', 'forensic', 'narrative'})
        self.assertTrue(all(row['status'] == 'completed' for row in response.data['analyses']))
        self.assertEqual(self.claim.investigations.count(), 1)
        forensic.assert_called_once()
        self.assertEqual(verify.call_count, 2)
        self.assertIn('forensic', verify.call_args.args[0]['previous_analysis'])

    @patch('rumor.providers.verify', return_value=VERIFICATION)
    def test_missing_forensic_service_blocks_narrative(self, verify):
        self.claim.media_type = 'video'
        self.claim.save()
        result = self.run_stage('all').data
        self.assertEqual(result['stage'], 'forensic')
        self.assertFalse(AnalysisRun.objects.filter(kind='narrative').exists())

    @patch('rumor.providers.verify', side_effect=providers.ProviderError('Provider unavailable'))
    def test_failure_can_be_retried_and_is_not_silently_completed(self, verify):
        self.assertEqual(self.run_stage('verification').data['analyses'][0]['status'], 'failed')
        self.assertEqual(self.run_stage('verification').status_code, 200)
        self.assertEqual(AnalysisRun.objects.filter(status='failed').count(), 2)

    def test_workflow_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/rumor/workflow/CL-WORKFLOW/').status_code, 401)
        self.assertEqual(self.run_stage('all').status_code, 401)


@override_settings(OPENAI_API_KEY='test-key', OPENAI_MODEL='test-model')
class ProviderContractTests(APITestCase):
    @override_settings(FORENSIC_SERVICE_URL='https://forensic.example/analyze', FORENSIC_SERVICE_TOKEN='test-token',
                       STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'}})
    @patch('rumor.providers.send')
    def test_forensic_contract_streams_original_bytes(self, send):
        file = SimpleUploadedFile('media.wav', b'actual-original-bytes')
        obj = Evidence.objects.create(file=file, name='media.wav', size=file.size, sha256='recorded-hash', media_type='audio')
        def receive(request):
            data = b''.join(request.data)
            self.assertIn(b'actual-original-bytes', data)
            self.assertIn(f'filename="{obj.pk}.bin"'.encode(), data)
            self.assertEqual(int(request.get_header('Content-length')), len(data))
            self.assertEqual(request.get_header('Authorization'), 'Bearer test-token')
            return FORENSIC
        send.side_effect = receive
        result = providers.forensic({'claim_id': 'CL-TEST'}, [obj])
        self.assertEqual(result['model'], 'test-detector-v1')

    @patch('rumor.providers.send')
    def test_openai_web_search_and_citations_are_preserved(self, send):
        structured = {key: value for key, value in VERIFICATION.items() if key != 'citations'}
        send.side_effect = [
            {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': 'Research text',
             'annotations': [{'type': 'url_citation', 'url': 'https://example.org/archive', 'title': 'Archive'}]}]}]},
            {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(structured)}]}]},
        ]
        result = providers.verify({'text': 'A rally occurred yesterday.'})
        self.assertEqual(result['citations'][0]['url'], 'https://example.org/archive')
        payload = json.loads(send.call_args_list[0].args[0].data)
        self.assertEqual(payload['tools'], [{'type': 'web_search'}])
        self.assertFalse(payload['store'])
        self.assertEqual(json.loads(send.call_args_list[1].args[0].data)['text']['format']['type'], 'json_schema')

    @patch('rumor.providers.send')
    def test_invalid_model_output_is_rejected(self, send):
        send.return_value = {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': '{}'}]}]}
        with self.assertRaises(providers.ProviderError):
            providers.narrative({'text': 'A claim'})

    @patch('rumor.providers.send')
    def test_absence_of_citations_forces_unverified(self, send):
        structured = {**{k: v for k, v in VERIFICATION.items() if k != 'citations'}, 'verdict': 'Supported', 'confidence': 90}
        send.side_effect = [
            {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': 'Uncited research'}]}]},
            {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(structured)}]}]},
        ]
        result = providers.verify({'text': 'A claim'})
        self.assertEqual(result['verdict'], 'Unverified')
        self.assertEqual(result['confidence'], 0)
