from django.conf import settings
from django.db import models


class Claim(models.Model):
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_claims')
    workflow_stage = models.CharField(max_length=30, default='intake')
    handling_mode = models.CharField(max_length=20, default='analyst')
    media_type = models.CharField(max_length=20, blank=True)
    generated_report = models.ForeignKey('IntelligenceReport', on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_claims')
    class Priority(models.TextChoices):
        CRITICAL = 'Critical', 'Critical'
        HIGH = 'High', 'High'
        MEDIUM = 'Medium', 'Medium'
        LOW = 'Low', 'Low'

    class Status(models.TextChoices):
        UNVERIFIED = 'Unverified', 'Unverified'
        SUPPORTED = 'Supported', 'Supported'
        MISLEADING = 'Misleading', 'Misleading'
        OUT_OF_CONTEXT = 'Out of Context', 'Out of Context'
        SYNTHETIC = 'Synthetic Media', 'Synthetic Media'
        REFUTED = 'Refuted', 'Refuted'
        SATIRE = 'Satire / Parody', 'Satire / Parody'

    claim_id = models.CharField(max_length=40, unique=True)
    text = models.TextField()
    language = models.CharField(max_length=40)
    source = models.CharField(max_length=255)
    url = models.CharField(max_length=500, blank=True, default='')
    cluster = models.CharField(max_length=80, blank=True, default='')
    first_seen = models.DateTimeField()
    match_count = models.PositiveIntegerField(default=0)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=40, choices=Status.choices, default=Status.UNVERIFIED)
    analyst = models.CharField(max_length=120, blank=True, default='')
    evidence = models.TextField(blank=True, default='')
    filters = models.JSONField(default=list, blank=True)
    review_score = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True, default='')
    intake_kind = models.CharField(max_length=20, blank=True, default='seed')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-first_seen', '-id']

    def __str__(self):
        return self.claim_id


class ValidatedClaim(models.Model):
    """Human-reviewed claims assessed as valid / supported. Internal match source for the scanner."""

    claim_id = models.CharField(max_length=40, unique=True)
    text = models.TextField()
    language = models.CharField(max_length=40, default='English')
    topic = models.CharField(max_length=80, blank=True, default='')
    authority = models.CharField(max_length=255)
    corroborators = models.CharField(max_length=400, blank=True, default='')
    source_url = models.URLField(max_length=1000, blank=True, default='')
    verdict = models.CharField(max_length=40, default='Supported')
    evidence = models.TextField(blank=True, default='')
    verified_by = models.CharField(max_length=120, blank=True, default='')
    verified_at = models.DateField()
    match_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-verified_at', '-id']

    def __str__(self):
        return self.claim_id


class SourceFeed(models.Model):
    name = models.CharField(max_length=255, unique=True)
    kind = models.CharField(max_length=40, default='rss')
    status = models.CharField(max_length=40, default='Healthy')
    is_internal = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class NarrativeCluster(models.Model):
    slug = models.CharField(max_length=80, unique=True)
    label = models.CharField(max_length=120)
    post_count = models.PositiveIntegerField(default=0)
    trend = models.CharField(max_length=40, default='Stable')

    class Meta:
        ordering = ['-post_count', 'slug']

    def __str__(self):
        return self.label


class Assessment(models.Model):
    class Stage(models.TextChoices):
        ANALYSIS = 'analysis', 'Analysis'
        ANALYST = 'analyst_review', 'Analyst Review'
        SUPERVISOR = 'supervisor', 'Supervisor'
        APPROVED = 'approved', 'Approved'

    claim = models.ForeignKey(Claim, on_delete=models.CASCADE, related_name='assessments')
    verdict = models.CharField(max_length=40)
    confidence = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True, default='')
    analyst = models.CharField(max_length=120, blank=True, default='')
    stage = models.CharField(max_length=40, choices=Stage.choices, default=Stage.ANALYST)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.claim.claim_id} · {self.verdict}'


class AlertState(models.Model):
    """Analyst assignment for a computed watch alert. The alert itself is derived, not stored."""

    alert_key = models.CharField(max_length=80, unique=True)
    assignee = models.CharField(max_length=120, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.alert_key} · {self.assignee or "Unassigned"}'


class Evidence(models.Model):
    claim = models.ForeignKey(Claim, on_delete=models.SET_NULL, null=True, blank=True, related_name='originals')
    media_type = models.CharField(max_length=20, blank=True)
    file = models.FileField(upload_to='evidence/%Y/%m/')
    name = models.CharField(max_length=255)
    size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    case_reference = models.CharField(max_length=120, blank=True)
    source_url = models.URLField(max_length=1000, blank=True)
    notes = models.TextField(blank=True)
    retention_hold = models.BooleanField(default=False)
    integrity = models.CharField(max_length=20, default='Verified')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True)

    class Meta:
        ordering = ['-created_at', '-id']


class EvidenceEvent(models.Model):
    evidence = models.ForeignKey(Evidence, related_name='events', on_delete=models.CASCADE)
    action = models.CharField(max_length=40)
    actor = models.CharField(max_length=255)
    detail = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']


class CouncilRun(models.Model):
    case = models.ForeignKey('cases.InvestigationCase', on_delete=models.SET_NULL, null=True, blank=True)
    claim = models.ForeignKey(Claim, on_delete=models.CASCADE, related_name='council_runs')
    started_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    status = models.CharField(max_length=20, default='running')
    snapshot = models.JSONField(default=dict)
    agents = models.JSONField(default=list)
    checks = models.JSONField(default=list)
    draft = models.TextField(blank=True)
    error = models.TextField(blank=True)
    assessment = models.OneToOneField(Assessment, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True)

    class Meta:
        ordering = ['-created_at', '-id']


class IntelligenceReport(models.Model):
    title = models.CharField(max_length=255)
    language = models.CharField(max_length=2, choices=[('en', 'English'), ('bn', 'Bangla')], default='en')
    summary = models.TextField(blank=True)
    findings = models.TextField(blank=True)
    recommendations = models.TextField(blank=True)
    case_reference = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=20, default='draft', choices=[
        ('draft', 'Draft'), ('pending', 'Pending review'), ('approved', 'Approved'), ('published', 'Published')])
    version = models.PositiveIntegerField(default=1)
    source_snapshot = models.JSONField(default=dict)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-updated_at', '-id']
        permissions = [('review_intelligencereport', 'Can review and publish intelligence reports')]


class ReportRevision(models.Model):
    report = models.ForeignKey(IntelligenceReport, related_name='revisions', on_delete=models.CASCADE)
    version = models.PositiveIntegerField()
    snapshot = models.JSONField(default=dict)
    actor = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version']
        constraints = [models.UniqueConstraint(fields=['report', 'version'], name='unique_report_version')]


class ReportEvent(models.Model):
    report = models.ForeignKey(IntelligenceReport, related_name='events', on_delete=models.CASCADE)
    action = models.CharField(max_length=40)
    actor = models.CharField(max_length=255)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']


class AnalysisRun(models.Model):
    claim = models.ForeignKey(Claim, on_delete=models.CASCADE, related_name='analysis_runs')
    kind = models.CharField(max_length=20)
    status = models.CharField(max_length=30, default='running')
    provider = models.CharField(max_length=80, blank=True)
    result = models.JSONField(default=dict)
    input_snapshot = models.JSONField(default=dict)
    error = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [models.UniqueConstraint(fields=['claim', 'kind'], condition=models.Q(status='running'), name='one_active_claim_analysis')]


class WorkflowAlert(models.Model):
    claim = models.OneToOneField(Claim, on_delete=models.CASCADE, related_name='workflow_alert')
    analysis = models.ForeignKey(AnalysisRun, on_delete=models.SET_NULL, null=True)
    severity = models.CharField(max_length=20)
    summary = models.TextField()
    reasons = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
