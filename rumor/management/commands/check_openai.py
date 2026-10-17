import json
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, build_opener

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from rumor.providers import NoRedirect


class Command(BaseCommand):
    help = 'Check OpenAI authentication and model access without generating content or displaying credentials.'

    def handle(self, *args, **options):
        if not settings.OPENAI_API_KEY or not settings.OPENAI_MODEL:
            raise CommandError('Set OPENAI_API_KEY and OPENAI_MODEL in the local .env file.')
        request = Request('https://api.openai.com/v1/models/' + quote(settings.OPENAI_MODEL, safe=''),
                          headers={'Authorization': f'Bearer {settings.OPENAI_API_KEY}'})
        try:
            with build_opener(NoRedirect).open(request, timeout=30) as response:
                data = json.loads(response.read(1024 * 1024))
        except HTTPError as error:
            raise CommandError(f'OpenAI returned HTTP {error.code}. Check key validity, permissions, and model access.') from None
        except (URLError, OSError, ValueError):
            raise CommandError('OpenAI could not be reached. Check network access and retry.') from None
        if data.get('id') != settings.OPENAI_MODEL:
            raise CommandError('OpenAI returned an unexpected model response.')
        self.stdout.write(self.style.SUCCESS(f'OpenAI authentication and model access verified: {settings.OPENAI_MODEL}.'))
