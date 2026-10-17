from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from authentication.models import OperatorProfile

User = get_user_model()

OPERATORS = [
    {
        'username': 'a.rahman',
        'password': 'shield-0421',
        'display_name': 'A. Rahman',
        'initials': 'AR',
        'role': 'Senior Analyst',
        'clearance': 'RESTRICTED',
        'unit': 'Narrative Control Directorate',
        'is_staff': True,
    },
    {
        'username': 's.karim',
        'password': 'review-0419',
        'display_name': 'S. Karim',
        'initials': 'SK',
        'role': 'Supervisor',
        'clearance': 'RESTRICTED',
        'unit': 'Review Authority',
        'is_staff': True,
    },
]


class Command(BaseCommand):
    help = 'Create demo NarrativeShield operators for local authentication.'

    def handle(self, *args, **options):
        for spec in OPERATORS:
            user, created = User.objects.get_or_create(username=spec['username'])
            user.set_password(spec['password'])
            user.is_staff = spec['is_staff']
            user.is_active = True
            user.save()

            OperatorProfile.objects.update_or_create(
                user=user,
                defaults={
                    'display_name': spec['display_name'],
                    'initials': spec['initials'],
                    'role': spec['role'],
                    'clearance': spec['clearance'],
                    'unit': spec['unit'],
                    'clearance_token': 'NS-ALPHA-7',
                },
            )
            action = 'Created' if created else 'Updated'
            self.stdout.write(self.style.SUCCESS(f'{action} operator {spec["username"]}'))
