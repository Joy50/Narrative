import hashlib
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from .models import Evidence


class EvidenceTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.directory.name)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username='vault-analyst', password='test-password')
        self.client.force_authenticate(self.user)

    def upload(self):
        response = self.client.post('/api/rumor/evidence/', {
            'file': SimpleUploadedFile('original.txt', b'original bytes'),
            'case_reference': 'INV-42',
        }, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_original_download_search_and_custody(self):
        row = self.upload()
        self.assertEqual(row['sha256'], hashlib.sha256(b'original bytes').hexdigest())
        self.assertNotIn('file', row)
        response = self.client.get(f"/api/rumor/evidence/{row['id']}/download/")
        self.assertEqual(b''.join(response.streaming_content), b'original bytes')
        response.close()
        listing = self.client.get('/api/rumor/evidence/?q=INV-42').data
        self.assertEqual(len(listing['results']), 1)
        self.assertEqual(len(listing['results'][0]['events']), 2)
        self.assertEqual(self.client.get('/api/rumor/evidence/?q=absent').data['results'], [])

    def test_tampered_and_missing_originals(self):
        row = self.upload()
        obj = Evidence.objects.get(pk=row['id'])
        Path(obj.file.path).write_bytes(b'tampered')
        url = f"/api/rumor/evidence/{obj.pk}/verify/"
        self.assertEqual(self.client.post(url).data['integrity'], 'Mismatch')
        obj.file.delete(save=False)
        self.assertEqual(self.client.post(url).data['integrity'], 'Missing')
        self.assertEqual(self.client.get(f'/api/rumor/evidence/{obj.pk}/download/').status_code, 404)

    def test_authentication_and_immutable_hash(self):
        row = self.upload()
        url = f"/api/rumor/evidence/{row['id']}/"
        self.assertEqual(self.client.patch(url, {'sha256': 'fake'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'retention_hold': True}, format='json').status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/rumor/evidence/').status_code, 401)
        self.assertEqual(self.client.get(url + 'download/').status_code, 401)
        self.assertEqual(self.client.post(url + 'verify/').status_code, 401)

    def test_empty_upload(self):
        self.assertEqual(self.client.post('/api/rumor/evidence/', {}, format='multipart').status_code, 400)
