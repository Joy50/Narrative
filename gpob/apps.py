from django.apps import AppConfig


class GpobConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'gpob'
    # Preserve existing database tables, migration history, and permissions.
    label = 'media'
    verbose_name = 'GPOB'
