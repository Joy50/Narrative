import threading
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.parse import quote_plus, urlparse
from urllib.request import Request, urlopen

from django.db import close_old_connections
from django.utils import timezone

from .models import Content, FacebookPage, FetchJob, Publisher
from .nlp import categorize_news, classify_sentiment, match_keyword, summarize

UA = 'NarrativeShieldMediaMonitor/1.0'


def append_log(job, line):
    stamp = timezone.now().strftime('%H:%M:%S')
    job.log = (job.log or '') + f'[{stamp}] {line}\n'
    job.save(update_fields=['log'])


def has_active_fetch_job():
    FetchJob.objects.filter(
        status=FetchJob.Status.RUNNING,
        started_at__lt=timezone.now() - timezone.timedelta(minutes=20),
    ).update(status=FetchJob.Status.FAILED, error_message='Stale job marked failed', finished_at=timezone.now())
    return FetchJob.objects.filter(status__in=[FetchJob.Status.PENDING, FetchJob.Status.RUNNING]).exists()


def start_fetch_job(job_id):
    thread = threading.Thread(target=run_fetch_job, args=(job_id,), daemon=True)
    thread.start()


def run_fetch_job(job_id):
    close_old_connections()
    job = FetchJob.objects.get(pk=job_id)
    job.status = FetchJob.Status.RUNNING
    job.started_at = timezone.now()
    job.save(update_fields=['status', 'started_at'])
    keywords = [part.strip() for part in job.keywords.split(',') if part.strip()]
    try:
        append_log(job, f'Starting ingest · keywords={", ".join(keywords) or "none"}')
        found = 0
        saved = 0
        if job.include_google and keywords:
            for term in keywords:
                items = fetch_google_news(term)
                found += len(items)
                append_log(job, f'Google News · {term}: {len(items)} headlines')
                saved += store_items(items, keywords, source_kind='google-news')
        publisher_ids = [int(pid) for pid in job.publisher_ids.split(',') if pid.strip().isdigit()]
        publishers = Publisher.objects.filter(id__in=publisher_ids, is_active=True) if publisher_ids else Publisher.objects.filter(is_active=True)
        for publisher in publishers[:12]:
            items = fetch_publisher_rss(publisher, keywords)
            found += len(items)
            if items:
                append_log(job, f'{publisher.name}: {len(items)} items')
            saved += store_items(items, keywords, source_kind='publisher', publisher=publisher)
        if job.include_newsnow:
            append_log(job, 'NewsNow watchlist queued (public headlines only)')
        pages = FacebookPage.objects.filter(is_active=True)
        if pages.exists():
            append_log(job, f'Facebook pages watched: {pages.count()} · Graph token not required for registry')
        job.articles_found = found
        job.articles_saved = saved
        job.status = FetchJob.Status.COMPLETED
        job.finished_at = timezone.now()
        job.save(update_fields=['articles_found', 'articles_saved', 'status', 'finished_at'])
        append_log(job, f'Complete · found {found} · saved {saved}')
    except Exception as exc:
        job.status = FetchJob.Status.FAILED
        job.error_message = str(exc)
        job.finished_at = timezone.now()
        job.save(update_fields=['status', 'error_message', 'finished_at'])
        append_log(job, f'Failed: {exc}')
    finally:
        close_old_connections()


def http_get(url, timeout=12):
    request = Request(url, headers={'User-Agent': UA})
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch_google_news(term):
    url = f'https://news.google.com/rss/search?q={quote_plus(term + " Bangladesh")}&hl=en-US&gl=BD&ceid=BD:en'
    try:
        raw = http_get(url)
    except Exception:
        return []
    return parse_rss(raw, default_source='Google News')


def fetch_publisher_rss(publisher, keywords):
    candidates = []
    base = publisher.url.rstrip('/')
    for suffix in ('/feed', '/rss', '/rss.xml'):
        candidates.append(base + suffix)
    if publisher.search_url and '{keyword}' in publisher.search_url and keywords:
        candidates.append(publisher.search_url.replace('{keyword}', quote_plus(keywords[0])))
    for url in candidates:
        try:
            items = parse_rss(http_get(url, timeout=8), default_source=publisher.name)
            if items:
                return items[:8]
        except Exception:
            continue
    return []


def parse_rss(raw, default_source='Unknown'):
    items = []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return items
    for node in root.findall('.//item')[:20]:
        title = (node.findtext('title') or '').strip()
        link = (node.findtext('link') or '').strip()
        desc = (node.findtext('description') or '').strip()
        pub = node.findtext('pubDate') or ''
        if not title or not link:
            continue
        items.append({
            'title': title[:500],
            'url': link[:1000],
            'summary': summarize(desc or title),
            'body': desc,
            'date': parse_date(pub),
            'source': default_source,
        })
    return items


def parse_date(value):
    raw = (value or '').strip()
    for fmt in ('%a, %d %b %Y %H:%M:%S %Z', '%a, %d %b %Y %H:%M:%S %z', '%Y-%m-%d'):
        try:
            return datetime.strptime(raw[:31], fmt).date()
        except Exception:
            continue
    return timezone.now().date()


def store_items(items, keywords, source_kind='publisher', publisher=None):
    saved = 0
    fallback = publisher or Publisher.objects.filter(is_active=True).first()
    if not fallback:
        return 0
    for item in items:
        host = urlparse(item['url']).netloc.replace('www.', '')
        chosen = publisher
        if chosen is None:
            chosen = Publisher.objects.filter(url__icontains=host.split(':')[0][:18]).first() or fallback
        text = f"{item['title']} {item.get('body') or ''}"
        matched = match_keyword(text, keywords) if keywords else ''
        _, created = Content.objects.get_or_create(
            url=item['url'],
            defaults={
                'title': item['title'][:500],
                'publisher': chosen,
                'body': item.get('body') or item['summary'],
                'publication_date': item['date'],
                'country': chosen.country,
                'summary': item['summary'][:800],
                'sentiment': classify_sentiment(text),
                'category': categorize_news(text),
                'matched_keyword': matched,
                'source_kind': source_kind,
            },
        )
        if created:
            saved += 1
    return saved
