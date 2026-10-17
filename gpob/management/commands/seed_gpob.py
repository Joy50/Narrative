from django.core.management.base import BaseCommand

from gpob.seeds import seed_gpob


class Command(BaseCommand):
    help = 'Seed countries, publishers, keywords, pages, and articles.'

    def handle(self, *args, **options):
        result = seed_gpob()
        self.stdout.write(self.style.SUCCESS(f'Seeded GPOB: {result}'))
