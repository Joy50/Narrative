from django.conf import settings
from django.db import models


class InvestigationCase(models.Model):
    class State(models.TextChoices):
        NEW = 'NEW', 'NEW'
        TRIAGED = 'TRIAGED', 'TRIAGED'
        IN_ANALYSIS = 'IN_ANALYSIS', 'IN_ANALYSIS'
        ANALYST_REVIEW = 'ANALYST_REVIEW', 'ANALYST REVIEW'
        SUPERVISOR_REVIEW = 'SUPERVISOR_REVIEW', 'SUPERVISOR REVIEW'
        APPROVED = 'APPROVED', 'APPROVED'
        PUBLISHED = 'PUBLISHED', 'PUBLISHED'
        NEEDS_MORE_EVIDENCE = 'NEEDS_MORE_EVIDENCE', 'NEEDS_MORE_EVIDENCE'
        REOPENED = 'REOPENED', 'REOPENED'
        CLOSED = 'CLOSED', 'CLOSED'

    class Priority(models.TextChoices):
        CRITICAL = 'Critical', 'Critical'
        HIGH = 'High', 'High'
        NORMAL = 'Normal', 'Normal'
        LOW = 'Low', 'Low'

    case_number = models.CharField(max_length=40, unique=True)
    title = models.CharField(max_length=240)
    summary = models.CharField(max_length=400, blank=True, default='')
    state = models.CharField(max_length=40, choices=State.choices, default=State.NEW)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='investigations',
    )
    assignee_name = models.CharField(max_length=120, blank=True, default='')
    claim = models.ForeignKey(
        'rumor.Claim',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='investigations',
    )
    evidence_count = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True, default='')
    source_key = models.CharField(max_length=120, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-id']

    def __str__(self):
        return self.case_number


class CaseEvent(models.Model):
    case = models.ForeignKey(InvestigationCase, on_delete=models.CASCADE, related_name='events')
    action = models.CharField(max_length=40)
    from_state = models.CharField(max_length=40, blank=True, default='')
    to_state = models.CharField(max_length=40, blank=True, default='')
    actor_name = models.CharField(max_length=120, blank=True, default='')
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.case.case_number} · {self.action}'
