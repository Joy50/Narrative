from django.conf import settings
from django.db import models


class OperatorProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    display_name = models.CharField(max_length=120)
    initials = models.CharField(max_length=4)
    role = models.CharField(max_length=80, default='Analyst')
    clearance = models.CharField(max_length=40, default='RESTRICTED')
    unit = models.CharField(max_length=120, default='Narrative Control Directorate')
    clearance_token = models.CharField(max_length=64, default='NS-ALPHA-7')

    class Meta:
        ordering = ['display_name']

    def __str__(self):
        return self.display_name or self.user.get_username()
