import json

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Claim, IntelligenceReport, ReportRevision


class ReportTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.author = users.objects.create_user(username='author')
        self.other = users.objects.create_user(username='other')
        self.reviewer = users.objects.create_user(username='reviewer', is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(self.author)
        self.claim = Claim.objects.create(claim_id='CL-1', text='Recorded claim', language='English', source='Test source', first_seen=timezone.now(), evidence='Recorded evidence')

    def create(self, **extra):
        result = self.client.post('/api/rumor/reports/', {'title': 'Intelligence brief', 'claim_ids': [self.claim.pk], **extra}, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        self.url = f"/api/rumor/reports/{result.data['id']}/"
        return result.data

    def action(self, name, version=1, **extra):
        return self.client.post(self.url + 'action/', {'action': name, 'version': version, **extra}, format='json')

    def test_snapshot_versions_and_conflicts(self):
        report = self.create()
        self.assertEqual(report['status'], 'draft')
        self.assertIn('Recorded claim', report['summary'])
        self.claim.text = 'Changed later'
        self.claim.save()
        result = self.client.patch(self.url, {'version': 1, 'summary': 'Reviewed summary'}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['version'], 2)
        self.assertEqual(result.data['source_snapshot']['claims'][0]['text'], 'Recorded claim')
        self.assertEqual(ReportRevision.objects.get(report_id=report['id'], version=1).snapshot['summary'], 'CL-1: Recorded claim')
        self.assertEqual(self.client.patch(self.url, {'version': 1, 'title': 'Stale'}, format='json').status_code, 409)
        self.assertEqual(self.action('submit', version=1).status_code, 409)
        self.assertEqual(self.client.patch(self.url, {'version': 2, 'status': 'published'}, format='json').status_code, 400)

    def test_workflow_and_permissions(self):
        self.create()
        self.assertEqual(self.action('publish').status_code, 403)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.patch(self.url, {'version': 1, 'title': 'Other edit'}, format='json').status_code, 403)
        self.assertEqual(self.action('submit').status_code, 403)
        self.client.force_authenticate(self.author)
        self.assertEqual(self.action('submit').data['status'], 'pending')
        self.assertEqual(self.action('approve').status_code, 403)
        self.assertEqual(self.client.patch(self.url, {'version': 1, 'summary': 'Locked'}, format='json').status_code, 400)
        self.client.force_authenticate(self.reviewer)
        self.assertEqual(self.action('publish').status_code, 400)
        self.assertEqual(self.action('approve').data['status'], 'approved')
        self.assertEqual(self.action('publish').data['status'], 'published')
        self.assertEqual(self.action('request_revision').status_code, 400)
        result = self.action('request_revision', note='Clarify sources')
        self.assertEqual(result.data['status'], 'draft')
        self.assertEqual(result.data['version'], 2)
        self.assertTrue(result.data['events'])

    def test_bangla_exports_and_search(self):
        report = self.create(title='????? ?????????', language='bn', summary='??????')
        result = self.client.get(self.url + 'export/?download=txt')
        self.assertEqual(result.status_code, 200)
        self.assertIn('??????', result.content.decode('utf-8'))
        self.assertIn('attachment;', result['Content-Disposition'])
        result = self.client.get(self.url + 'export/?download=json')
        self.assertEqual(json.loads(result.content)['source_snapshot'], report['source_snapshot'])
        self.assertEqual(len(self.client.get('/api/rumor/reports/?status=draft').data['results']), 1)
        self.assertEqual(self.client.get('/api/rumor/reports/?q=absent').data['results'], [])

    def test_validation_and_anonymous_access(self):
        self.assertEqual(self.client.post('/api/rumor/reports/', {'title': 'Missing sources', 'claim_ids': []}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/rumor/reports/', {'title': 'Missing source', 'claim_ids': [99999]}, format='json').status_code, 400)
        self.create()
        self.client.force_authenticate(None)
        for url in ['/api/rumor/reports/', self.url, self.url + 'export/']:
            self.assertEqual(self.client.get(url).status_code, 401)
        self.assertEqual(self.action('submit').status_code, 401)
