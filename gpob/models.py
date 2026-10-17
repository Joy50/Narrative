from django.conf import settings
from django.db import models


class Country(models.Model):
    name = models.CharField(max_length=255, unique=True)
    flag = models.CharField(max_length=16, blank=True, default='')
    code = models.CharField(max_length=8, blank=True, default='')

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Publisher(models.Model):
    name = models.CharField(max_length=255)
    country = models.ForeignKey(Country, on_delete=models.CASCADE, related_name='publishers')
    url = models.CharField(max_length=500)
    search_url = models.CharField(max_length=500, blank=True, default='')
    title_element = models.CharField(max_length=255, blank=True, default='h1')
    link_element = models.CharField(max_length=255, blank=True, default='a')
    content_element = models.CharField(max_length=255, blank=True, default='article')
    date_element = models.CharField(max_length=255, blank=True, default='time')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        unique_together = ('name', 'country')

    def __str__(self):
        return self.name


class Keyword(models.Model):
    term = models.CharField(max_length=255, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['term']

    def __str__(self):
        return self.term


class Content(models.Model):
    class Sentiment(models.TextChoices):
        POSITIVE = 'Positive', 'Positive'
        NEGATIVE = 'Negative', 'Negative'
        NEUTRAL = 'Neutral', 'Neutral'

    class Category(models.TextChoices):
        POLITICS = 'Politics', 'Politics'
        SPORTS = 'Sports', 'Sports'
        TECHNOLOGY = 'Technology', 'Technology'
        ENTERTAINMENT = 'Entertainment', 'Entertainment'
        BUSINESS = 'Business', 'Business'
        HEALTH = 'Health', 'Health'
        SCIENCE = 'Science', 'Science'
        GENERAL = 'General', 'General'

    title = models.CharField(max_length=500)
    publisher = models.ForeignKey(Publisher, on_delete=models.CASCADE, related_name='articles')
    body = models.TextField(blank=True, default='')
    url = models.URLField(max_length=1000, unique=True)
    publication_date = models.DateField()
    country = models.ForeignKey(Country, on_delete=models.CASCADE, related_name='articles')
    summary = models.CharField(max_length=800, blank=True, default='')
    sentiment = models.CharField(max_length=10, choices=Sentiment.choices, null=True, blank=True)
    category = models.CharField(max_length=50, choices=Category.choices, null=True, blank=True)
    matched_keyword = models.CharField(max_length=255, blank=True, default='')
    source_kind = models.CharField(max_length=40, blank=True, default='publisher')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-publication_date', '-id']

    def __str__(self):
        return self.title


class FacebookPage(models.Model):
    name = models.CharField(max_length=255)
    page_id = models.CharField(max_length=255, unique=True)
    category = models.CharField(max_length=50, choices=Content.Category.choices)
    country = models.ForeignKey(Country, on_delete=models.SET_NULL, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['category', 'name']

    @property
    def page_url(self):
        return f'https://www.facebook.com/{self.page_id}'


class FetchJob(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        RUNNING = 'running', 'Running'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    keywords = models.CharField(max_length=500)
    categories = models.CharField(max_length=500, blank=True, default='')
    start_date = models.DateField()
    end_date = models.DateField()
    publisher_ids = models.CharField(max_length=500, blank=True, default='')
    include_newsnow = models.BooleanField(default=True)
    include_google = models.BooleanField(default=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    articles_found = models.PositiveIntegerField(default=0)
    articles_saved = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True, default='')
    log = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
