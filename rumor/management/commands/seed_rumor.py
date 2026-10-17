from django.core.management.base import BaseCommand

from rumor.seeds import seed_rumor


class Command(BaseCommand):
    help = 'Seed rumor scanner claims, source feeds, clusters, and the internal validated-claim database.'

    def handle(self, *args, **options):
        result = seed_rumor()
        self.stdout.write(self.style.SUCCESS(f'Seeded rumor scanner: {result}'))
