from django.core.management.base import BaseCommand

from cases.seeds import seed_cases


class Command(BaseCommand):
    help = 'Seed the investigation case registry used by the cases desk.'

    def handle(self, *args, **options):
        result = seed_cases()
        self.stdout.write(self.style.SUCCESS(f'Seeded investigation cases: {result}'))
