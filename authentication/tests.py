from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from authentication.models import OperatorProfile

User = get_user_model()


class AuthenticationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='a.rahman', password='shield-0421')
        OperatorProfile.objects.create(
            user=self.user,
            display_name='A. Rahman',
            initials='AR',
            role='Senior Analyst',
            clearance='RESTRICTED',
            unit='Narrative Control Directorate',
            clearance_token='NS-ALPHA-7',
        )

    def test_login_success_without_clearance_token(self):
        response = self.client.post('/api/auth/login/', {
            'operator_id': 'a.rahman',
            'passphrase': 'shield-0421',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertEqual(response.data['user']['name'], 'A. Rahman')

    def test_login_rejects_bad_password(self):
        response = self.client.post('/api/auth/login/', {
            'operator_id': 'a.rahman',
            'passphrase': 'wrong',
        }, format='json')
        self.assertEqual(response.status_code, 401)

    def test_me_requires_token(self):
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, 401)

        login = self.client.post('/api/auth/login/', {
            'operator_id': 'a.rahman',
            'passphrase': 'shield-0421',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')
        me = self.client.get('/api/auth/me/')
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data['operator_id'], 'a.rahman')
