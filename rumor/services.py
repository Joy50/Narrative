import math
import re
from django.db.models import Count, Max, Sum
from django.utils import timezone

from .models import AlertState, Assessment, Claim, NarrativeCluster, SourceFeed, ValidatedClaim

BN_RE = re.compile(r'[\u0980-\u09FF]')
TOKEN_RE = re.compile(r'[\w\u0980-\u09FF]{3,}', re.UNICODE)
BANGLISH = {
    'ache', 'kore', 'dhaka', 'gese', 'chole', 'lagbe', 'hobe', 'nai',
    'ami', 'tumi', 'bhai', 'apa', 'protest', 'police',
}

TOPIC_RULES = [
    ('internet-shutdown', ('internet', 'shutdown', 'ইন্টারনেট', 'বন্ধ', 'btrc')),
    ('padma-bridge', ('padma', 'bridge', 'পদ্মা', 'সেতু')),
    ('cabinet-audio', ('audio', 'curfew', 'কারফিউ', 'মন্ত্রী', 'cabinet')),
    ('protest-recycle', ('protest', 'rally', 'পুলিশ', 'বিক্ষোভ')),
    ('inflation', ('inflation', 'bbs', 'মুদ্রাস্ফীতি', '9.7')),
    ('cyclone-warning', ('cyclone', 'bmd', 'ঘূর্ণিঝড়', 'harbor')),
    ('election-schedule', ('election', 'তফসিল', 'কমিশন', 'poll')),
    ('flood-recede', ('flood', 'বন্যা', 'relief', 'water')),
    ('budget-allocation', ('budget', 'finance', 'বাজেট')),
    ('policy-rate', ('policy rate', 'bangladesh bank', 'সুদ')),
    ('vaccination-coverage', ('vaccine', 'dghs', 'booster', 'টিকা')),
    ('cricket-fixtures', ('cricket', 'stadium', 'bcb', 'ক্রিকেট')),
]

CRITICAL_HINTS = ('curfew', 'কারফিউ', 'evacuation', 'cabinet', 'অডিও')
HIGH_HINTS = ('shutdown', 'ইন্টারনেট', 'election', 'নির্বাচন', 'protest', 'বিক্ষোভ')
MEDIUM_HINTS = ('flood', 'বন্যা', 'bridge', 'পদ্মা', 'cyclone', 'ঘূর্ণিঝড়')


def detect_language(text):
    raw = text or ''
    bn = len(BN_RE.findall(raw))
    latin = len(re.findall(r'[A-Za-z]', raw))
    words = set(re.findall(r'[a-z]+', raw.lower()))
    if bn > 10 and latin > 10:
        return 'Banglish'
    if bn > latin:
        return 'বাংলা'
    if len(words & BANGLISH) >= 2:
        return 'Banglish'
    return 'English'


def language_filters(language, priority, status):
    tags = []
    if language == 'বাংলা':
        tags.append('Bangla')
    elif language:
        tags.append(language)
    if status == Claim.Status.UNVERIFIED:
        tags.append('Unreviewed')
    if priority in (Claim.Priority.HIGH, Claim.Priority.CRITICAL):
        tags.append('High')
    return tags


def suggest_cluster(text):
    blob = (text or '').lower()
    for slug, needles in TOPIC_RULES:
        if any(needle.lower() in blob for needle in needles):
            return slug
    tokens = TOKEN_RE.findall(blob)
    return '-'.join(tokens[:3]) if tokens else 'unclassified'


def triage_priority(text):
    blob = (text or '').lower()
    if any(hint in blob for hint in CRITICAL_HINTS):
        return Claim.Priority.CRITICAL
    if any(hint in blob for hint in HIGH_HINTS):
        return Claim.Priority.HIGH
    if any(hint in blob for hint in MEDIUM_HINTS):
        return Claim.Priority.MEDIUM
    return Claim.Priority.LOW


def review_score(priority, match_count=0):
    base = {
        Claim.Priority.CRITICAL: 88,
        Claim.Priority.HIGH: 76,
        Claim.Priority.MEDIUM: 58,
        Claim.Priority.LOW: 34,
    }.get(priority, 40)
    return min(99, base + min(int(match_count or 0), 12))


def normalize_text(text):
    return re.sub(r'\s+', ' ', (text or '').strip().lower())


def extract_atomic_claims(text):
    raw = (text or '').strip()
    if not raw:
        return []
    chunks = re.split(r'(?:\n+|(?<=[।.!?])\s+)', raw)
    pieces = []
    for chunk in chunks:
        cleaned = chunk.strip(' \"\'“”‘’')
        if len(cleaned) >= 28:
            pieces.append(cleaned)
    if not pieces:
        pieces = [raw]
    seen = set()
    unique = []
    for piece in pieces:
        key = normalize_text(piece)
        if key in seen:
            continue
        seen.add(key)
        unique.append(piece)
    return unique[:8]


def next_claim_id():
    year = timezone.now().year
    prefix = f'CL-{year}-'
    latest = (
        Claim.objects.filter(claim_id__startswith=prefix)
        .order_by('-claim_id')
        .values_list('claim_id', flat=True)
        .first()
    )
    serial = 8400
    if latest:
        try:
            serial = int(latest.split('-')[-1]) + 1
        except ValueError:
            serial = Claim.objects.count() + 8400
    return f'{prefix}{serial:04d}'


def tokens(text):
    return set(TOKEN_RE.findall(normalize_text(text)))


def find_duplicate(text, url=''):
    if url and url.startswith('http') and 'example' not in url:
        hit = Claim.objects.filter(url=url).first()
        if hit:
            return hit
    incoming = tokens(text)
    if not incoming:
        return Claim.objects.filter(text__iexact=text.strip()).first()
    for claim in Claim.objects.all()[:400]:
        existing = tokens(claim.text)
        if not existing:
            continue
        overlap = len(incoming & existing) / max(len(incoming | existing), 1)
        if overlap >= 0.72:
            return claim
    return None


def match_validated(claim, corpus=None):
    corpus = corpus if corpus is not None else list(ValidatedClaim.objects.filter(is_active=True))
    cluster = (getattr(claim, 'cluster', '') or '').lower()
    text = (getattr(claim, 'text', '') or '').lower()
    claim_id = getattr(claim, 'claim_id', '')
    incoming = tokens(text)
    best = None
    best_score = 0
    for row in corpus:
        if row.claim_id == claim_id:
            return row
        topic = (row.topic or '').lower()
        score = 0
        if topic and (topic in cluster or topic.replace('-', ' ') in text):
            score += 3
        overlap = len(incoming & tokens(row.text))
        if overlap:
            score += overlap
        if score > best_score and score >= 3:
            best = row
            best_score = score
    return best


def operator_name(user):
    profile = getattr(user, 'profile', None)
    if profile and profile.display_name:
        return profile.display_name
    if user and getattr(user, 'username', None):
        return user.username
    return 'Unassigned'


def ingest_text(text, *, source='Manual intake', url='', platform='', notes='', user=None, intake_kind='text', priority=None):
    created = []
    duplicates = []
    for piece in extract_atomic_claims(text):
        existing = find_duplicate(piece, url)
        if existing:
            existing.match_count += 1
            existing.save(update_fields=['match_count'])
            duplicates.append(existing)
            continue
        language = detect_language(piece)
        cluster = suggest_cluster(piece)
        chosen_priority = priority or triage_priority(piece)
        status = Claim.Status.UNVERIFIED
        claim = Claim.objects.create(
            claim_id=next_claim_id(),
            text=piece,
            language=language,
            source=source or (f'{platform} · public source' if platform else 'Manual intake'),
            url=url or '',
            cluster=cluster,
            first_seen=timezone.now(),
            match_count=1,
            priority=chosen_priority,
            status=status,
            analyst=operator_name(user),
            evidence=notes or 'Intake recorded. Spread count is a triage signal, not a falsity score.',
            filters=language_filters(language, chosen_priority, status),
            review_score=review_score(chosen_priority, 1),
            notes=notes,
            intake_kind=intake_kind,
        )
        hit = match_validated(claim)
        if hit:
            hit.match_count += 1
            hit.save(update_fields=['match_count'])
            claim.evidence = (
                f'Matched internal validated record {hit.claim_id} ({hit.authority}). '
                'Corroboration pointer only — not automatic proof.'
            )
            claim.save(update_fields=['evidence'])
        created.append(claim)
    rebuild_clusters()
    return created, duplicates


def rebuild_clusters():
    now = timezone.now()
    grouped = (
        Claim.objects.exclude(cluster='')
        .values('cluster')
        .annotate(posts=Sum('match_count'), items=Count('id'), latest=Max('first_seen'))
    )
    seen = set()
    for row in grouped:
        slug = row['cluster']
        seen.add(slug)
        latest = row['latest']
        hours = (now - latest).total_seconds() / 3600 if latest else 99
        count = row['items'] or 0
        if hours <= 8 and count >= 2:
            trend = 'Spiking'
        elif count >= 3:
            trend = 'Growing'
        else:
            trend = 'Stable'
        NarrativeCluster.objects.update_or_create(
            slug=slug,
            defaults={
                'label': f'#{slug}',
                'post_count': row['posts'] or count,
                'trend': trend,
            },
        )
    NarrativeCluster.objects.exclude(slug__in=seen).delete()
    return list(NarrativeCluster.objects.all())


def extract_from_existing():
    created_total = []
    dup_total = []
    for claim in Claim.objects.all()[:80]:
        created, duplicates = ingest_text(
            claim.text,
            source=claim.source,
            url=claim.url,
            notes='Bulk extraction from existing rumor-app records.',
            intake_kind='extract',
        )
        created_total.extend(created)
        dup_total.extend(duplicates)
    return created_total, dup_total


def scan_sources():
    corpus = list(ValidatedClaim.objects.filter(is_active=True))
    matched = 0
    for claim in Claim.objects.all():
        hit = match_validated(claim, corpus)
        if not hit:
            continue
        matched += 1
        claim.match_count = max(claim.match_count, 1)
        if 'Matched internal validated record' not in (claim.evidence or ''):
            claim.evidence = (
                f'Matched internal validated record {hit.claim_id} ({hit.authority}). '
                'Corroboration pointer only — not automatic proof.'
            )
            claim.save(update_fields=['evidence', 'match_count'])
        else:
            claim.save(update_fields=['match_count'])
        hit.match_count = Claim.objects.filter(cluster=hit.topic).count() or hit.match_count
        hit.save(update_fields=['match_count'])

    SourceFeed.objects.filter(is_internal=True).update(status='Healthy')
    rebuild_clusters()
    return {
        'feeds': SourceFeed.objects.filter(is_active=True).count(),
        'matched': matched,
        'validated': len(corpus),
        'scanned_at': timezone.now().isoformat(),
    }


def evidence_for(claim, hit=None):
    items = [{
        'stance': 'SOURCE',
        'stance_class': 'st-neutral',
        'name': claim.source or 'Original claim',
        'snippet': claim.text,
        'meta': f'{claim.language} · {claim.url or "no URL"} · provenance: intake',
    }]
    if hit:
        items.append({
            'stance': 'INTERNAL',
            'stance_class': 'st-support',
            'name': f'Internal validated-claim database — {hit.claim_id}',
            'snippet': hit.text,
            'meta': f'{hit.authority} · verified {hit.verified_at} · {hit.match_count} matches',
        })
    else:
        items.append({
            'stance': 'INTERNAL',
            'stance_class': 'st-context',
            'name': 'Internal validated-claim database — no matching valid record',
            'snippet': 'No Supported record in the rumor-app database matches this claim closely enough for automatic corroboration.',
            'meta': f'Internal DB · {ValidatedClaim.objects.filter(is_active=True).count()} valid records searched',
        })
    cluster = claim.cluster
    if cluster == 'internet-shutdown':
        items.insert(0, {
            'stance': 'CONTRADICTS',
            'stance_class': 'st-contradict',
            'name': 'Prior official denials on nationwide shutdown notices',
            'snippet': 'Similar notices have been denied by public authorities in previous cycles. Treat this as a lead for review, not a conclusion.',
            'meta': 'Archive pattern · relevance 0.84',
        })
    return items


def apply_assessment(claim, *, verdict, confidence, notes, user, promote=False):
    mapping = {
        'supported': Claim.Status.SUPPORTED,
        'refuted': Claim.Status.REFUTED,
        'misleading': Claim.Status.MISLEADING,
        'ctx': Claim.Status.OUT_OF_CONTEXT,
        'out of context': Claim.Status.OUT_OF_CONTEXT,
        'synthetic': Claim.Status.SYNTHETIC,
        'synthetic media': Claim.Status.SYNTHETIC,
        'unverified': Claim.Status.UNVERIFIED,
        'satire': Claim.Status.SATIRE,
        'satire / parody': Claim.Status.SATIRE,
    }
    status = mapping.get((verdict or '').strip().lower(), verdict or Claim.Status.UNVERIFIED)
    analyst = operator_name(user)
    claim.status = status
    claim.analyst = analyst
    claim.evidence = notes or claim.evidence
    claim.filters = language_filters(claim.language, claim.priority, claim.status)
    claim.save()
    assessment = Assessment.objects.create(
        claim=claim,
        verdict=status,
        confidence=max(0, min(int(confidence or 0), 100)),
        notes=notes or '',
        analyst=analyst,
        stage=Assessment.Stage.SUPERVISOR,
    )
    if status == Claim.Status.SUPPORTED:
        ValidatedClaim.objects.update_or_create(
            claim_id=claim.claim_id,
            defaults={
                'text': claim.text,
                'language': claim.language,
                'topic': claim.cluster,
                'authority': 'Human-reviewed rumor desk',
                'corroborators': analyst,
                'source_url': claim.url if claim.url.startswith('http') else '',
                'verdict': 'Supported',
                'evidence': notes or claim.evidence,
                'verified_by': analyst,
                'verified_at': timezone.now().date(),
                'match_count': claim.match_count,
                'is_active': True,
            },
        )
    rebuild_clusters()
    return assessment


PLATFORM_RULES = [
    ('Facebook', ('facebook', 'fb.com', 'prothom alo')),
    ('X', ('twitter', 'x.com', 'x /')),
    ('TikTok', ('tiktok',)),
    ('Telegram', ('telegram', 't.me')),
    ('YouTube', ('youtube', 'youtu.be')),
    ('WhatsApp', ('whatsapp', 'forwarded', 'groups')),
    ('News site', ('medium', 'blog', 'news')),
    ('Audio', ('audio',)),
]

RECYCLE_HINTS = (
    '2019', '2023', 'recycled', 'old ', 'construction photo', 'geolocation',
    'out of context', 'পুনরায়', 'পুরনো',
)


def infer_platform(source='', url=''):
    blob = f'{source} {url}'.lower()
    for name, needles in PLATFORM_RULES:
        if any(needle in blob for needle in needles):
            return name
    return 'Public web'


def age_label(dt, now=None):
    now = now or timezone.now()
    if not dt:
        return '—'
    hours = max((now - dt).total_seconds() / 3600.0, 0)
    if hours < 1:
        return f'{max(int(hours * 60), 1)}m'
    if hours < 48:
        return f'{int(hours)}h'
    return f'{int(hours / 24)}d'


def trend_style(trend):
    key = (trend or 'Stable').title()
    if key == 'Spiking':
        return {'tag': 'SPIKING', 'bg': 'rgba(194,65,12,0.10)', 'color': '#C2410C'}
    if key == 'Growing':
        return {'tag': 'GROWING', 'bg': 'rgba(180,83,9,0.10)', 'color': '#B45309'}
    return {'tag': 'STABLE', 'bg': 'rgba(4,120,87,0.10)', 'color': '#047857'}


def _claim_brief(claim, hit=None):
    return {
        'id': claim.id,
        'claim_id': claim.claim_id,
        'text': claim.text,
        'language': claim.language,
        'source': claim.source,
        'url': claim.url,
        'cluster': claim.cluster,
        'first_seen': claim.first_seen.isoformat() if claim.first_seen else None,
        'first_seen_label': claim.first_seen.strftime('%d %b %Y %H:%M UTC') if claim.first_seen else '',
        'match_count': claim.match_count,
        'priority': claim.priority,
        'status': claim.status,
        'analyst': claim.analyst,
        'evidence': claim.evidence,
        'review_score': claim.review_score,
        'validated_match': {
            'claim_id': hit.claim_id,
            'authority': hit.authority,
            'text': hit.text,
            'topic': hit.topic,
        } if hit else None,
    }


def _build_graph(claims, corpus):
    if not claims:
        return {'nodes': [], 'links': []}

    ordered = sorted(claims, key=lambda row: row.first_seen or timezone.now())
    origin = ordered[0]
    platforms = []
    sources = []
    for claim in ordered:
        platform = infer_platform(claim.source, claim.url)
        if platform not in platforms:
            platforms.append(platform)
        source = claim.source or 'Unattributed public source'
        if source not in sources:
            sources.append(source)
    sources = sources[:8]
    shown_claims = ordered[:10]
    validated_rows = []
    for claim in shown_claims:
        hit = match_validated(claim, corpus)
        if hit and hit.claim_id not in {row.claim_id for row in validated_rows}:
            validated_rows.append(hit)
    validated_rows = validated_rows[:4]

    nodes = [{
        'id': 'origin',
        'label': origin.claim_id,
        'kind': 'origin',
        'size': 16,
        'color': '#0EA5A4',
        'claim_id': origin.claim_id,
        'x': 280,
        'y': 200,
        'tx': 70,
        'ty': 70,
    }]
    links = []

    def place(kind, items, radius, color, size, tx_y):
        placed = []
        count = len(items)
        for index, item in enumerate(items):
            angle = (-90 + (360.0 * index / max(count, 1))) * math.pi / 180.0
            node_id = f'{kind}-{index}'
            nodes.append({
                'id': node_id,
                'label': item[:22],
                'kind': kind,
                'size': size,
                'color': color,
                'x': 280 + radius * math.cos(angle),
                'y': 200 + radius * math.sin(angle),
                'tx': 90 + (index * (380 / max(count - 1, 1)) if count > 1 else 190),
                'ty': tx_y,
            })
            placed.append((node_id, item))
        return placed

    platform_nodes = place('cross', platforms, 95, '#C74B4B', 11, 150)
    source_nodes = place('amplify', sources, 145, '#D97706', 10, 220)
    claim_nodes = place('claim', [c.claim_id for c in shown_claims], 190, '#059669', 9, 290)
    validated_nodes = place('internal', [row.claim_id for row in validated_rows], 230, '#2563EB', 8, 350)

    platform_by_name = {name: node_id for node_id, name in platform_nodes}
    source_by_name = {name: node_id for node_id, name in source_nodes}
    claim_by_id = {name: node_id for node_id, name in claim_nodes}
    validated_by_id = {name: node_id for node_id, name in validated_nodes}

    if platform_nodes:
        links.append({'source': 'origin', 'target': platform_nodes[0][0], 'kind': 'strong'})
    elif source_nodes:
        links.append({'source': 'origin', 'target': source_nodes[0][0], 'kind': 'strong'})

    for claim in shown_claims:
        claim_node = claim_by_id.get(claim.claim_id)
        platform_node = platform_by_name.get(infer_platform(claim.source, claim.url))
        source_node = source_by_name.get(claim.source or 'Unattributed public source')
        if claim_node and source_node:
            links.append({'source': source_node, 'target': claim_node, 'kind': 'strong'})
        if claim_node and platform_node:
            links.append({'source': platform_node, 'target': claim_node, 'kind': ''})
        hit = match_validated(claim, corpus)
        if claim_node and hit and hit.claim_id in validated_by_id:
            suspicious = claim.status in (Claim.Status.UNVERIFIED, Claim.Status.MISLEADING, Claim.Status.OUT_OF_CONTEXT, Claim.Status.SYNTHETIC)
            links.append({
                'source': claim_node,
                'target': validated_by_id[hit.claim_id],
                'kind': 'suspicious' if suspicious else '',
            })

    if len(platform_nodes) >= 2:
        links.append({'source': platform_nodes[0][0], 'target': platform_nodes[1][0], 'kind': 'suspicious'})

    for index, claim in enumerate(shown_claims):
        node = next((row for row in nodes if row['id'] == claim_by_id.get(claim.claim_id)), None)
        if not node:
            continue
        if claim.status == Claim.Status.SYNTHETIC or claim.priority == Claim.Priority.CRITICAL:
            node['color'] = '#C74B4B'
            node['kind'] = 'cross'
        elif claim.status == Claim.Status.SUPPORTED:
            node['color'] = '#059669'
            node['kind'] = 'organic'
        elif claim.status in (Claim.Status.OUT_OF_CONTEXT, Claim.Status.MISLEADING):
            node['color'] = '#D97706'
            node['kind'] = 'amplify'

    return {'nodes': nodes, 'links': links}


def _cluster_metrics(claims, now):
    if not claims:
        return {'velocity': 0, 'cross_platform': 0, 'recycle_risk': 0}
    latest = max((row.first_seen for row in claims if row.first_seen), default=now)
    hours = max((now - latest).total_seconds() / 3600.0, 0.4)
    matches = sum(row.match_count or 0 for row in claims)
    platforms = {infer_platform(row.source, row.url) for row in claims}
    sources = {row.source for row in claims if row.source}
    velocity = min(99, int(18 + matches * 1.6 + max(0, 36 - hours) * 1.4 + len(claims) * 4))
    cross_platform = min(99, int(len(platforms) * 26 + min(len(sources), 6) * 6))
    recycle = 8
    blob = ' '.join(f'{row.text} {row.evidence}' for row in claims).lower()
    if any(hint in blob for hint in RECYCLE_HINTS):
        recycle += 28
    if any(row.status == Claim.Status.OUT_OF_CONTEXT for row in claims):
        recycle += 22
    if any(row.status == Claim.Status.SYNTHETIC for row in claims):
        recycle += 20
    if any(row.status == Claim.Status.MISLEADING for row in claims):
        recycle += 12
    return {
        'velocity': velocity,
        'cross_platform': cross_platform,
        'recycle_risk': min(99, recycle),
    }


def _timeline(claims, cluster, corpus, now):
    events = []
    ordered = sorted(claims, key=lambda row: row.first_seen or now)
    for index, claim in enumerate(ordered):
        platform = infer_platform(claim.source, claim.url)
        tone = 'green' if claim.status == Claim.Status.SUPPORTED else ('red' if claim.status == Claim.Status.SYNTHETIC or claim.priority == Claim.Priority.CRITICAL else ('amber' if index else ''))
        events.append({
            'time': claim.first_seen.strftime('%H:%M · %d %b') if claim.first_seen else '—',
            'title': f'{platform} · {claim.claim_id}',
            'detail': (claim.text or '')[:160],
            'tone': tone,
            'claim_id': claim.claim_id,
        })
        hit = match_validated(claim, corpus)
        if hit:
            events.append({
                'time': 'Internal DB',
                'title': f'Matched validated {hit.claim_id}',
                'detail': f'{hit.authority}: corroboration pointer only — not automatic proof.',
                'tone': 'green',
                'claim_id': claim.claim_id,
            })
        latest = claim.assessments.first() if hasattr(claim, 'assessments') else None
        if latest:
            events.append({
                'time': latest.created_at.strftime('%H:%M · %d %b') if latest.created_at else 'Assessment',
                'title': f'Human assessment · {latest.verdict}',
                'detail': latest.notes or f'{latest.analyst} recorded a {latest.verdict} verdict.',
                'tone': 'green' if latest.verdict == Claim.Status.SUPPORTED else 'amber',
                'claim_id': claim.claim_id,
            })
    if not events:
        events.append({
            'time': age_label(now, now),
            'title': f'#{cluster}',
            'detail': 'No observed public claims in this cluster yet.',
            'tone': '',
            'claim_id': '',
        })
    return events[:12]


def build_narrative_analysis(selected_slug=None):
    now = timezone.now()
    rebuild_clusters()
    corpus = list(ValidatedClaim.objects.filter(is_active=True))
    clusters = list(NarrativeCluster.objects.all())
    all_claims = list(Claim.objects.prefetch_related('assessments'))
    by_cluster = {}
    for claim in all_claims:
        by_cluster.setdefault(claim.cluster or 'unclassified', []).append(claim)

    summaries = []
    anomalous = 0
    spread_nodes = 0
    for cluster in clusters:
        claims = by_cluster.get(cluster.slug, [])
        if not claims:
            continue
        metrics = _cluster_metrics(claims, now)
        platforms = {infer_platform(row.source, row.url) for row in claims}
        sources = {row.source for row in claims if row.source}
        nodes = 1 + len(platforms) + len(sources) + len(claims)
        spread_nodes += nodes
        latest = max((row.first_seen for row in claims if row.first_seen), default=now)
        first = min((row.first_seen for row in claims if row.first_seen), default=now)
        flagged = (
            cluster.trend == 'Spiking'
            or metrics['recycle_risk'] >= 60
            or any(row.status == Claim.Status.SYNTHETIC or row.priority == Claim.Priority.CRITICAL for row in claims)
        )
        if flagged:
            anomalous += 1
        summaries.append({
            'id': cluster.slug,
            'slug': cluster.slug,
            'title': cluster.label,
            'desc': (claims[0].text or '')[:140],
            'claims': len(claims),
            'nodes': nodes,
            'age': age_label(latest, now),
            'first_seen': first.isoformat() if first else None,
            'trend': cluster.trend,
            'style': trend_style(cluster.trend),
            'metrics': metrics,
            'flagged': flagged,
            'matches': sum(row.match_count or 0 for row in claims),
        })

    summaries.sort(key=lambda row: (row['trend'] != 'Spiking', row['trend'] != 'Growing', -row['matches']))
    chosen = selected_slug if selected_slug in {row['slug'] for row in summaries} else (summaries[0]['slug'] if summaries else '')
    selected_claims = by_cluster.get(chosen, [])
    selected_meta = next((row for row in summaries if row['slug'] == chosen), None)
    selected_validated = []
    for claim in selected_claims:
        hit = match_validated(claim, corpus)
        if hit and hit.claim_id not in {row.claim_id for row in selected_validated}:
            selected_validated.append(hit)

    series = []
    if selected_claims:
        buckets = {}
        for claim in selected_claims:
            if not claim.first_seen:
                continue
            key = claim.first_seen.strftime('%d %b')
            buckets[key] = buckets.get(key, 0) + max(claim.match_count or 1, 1)
        for label, value in list(buckets.items())[-7:]:
            series.append({'label': label, 'posts': value})

    return {
        'overview': {
            'active': len(summaries),
            'claims_clustered': len([row for row in all_claims if row.cluster]),
            'spread_nodes': spread_nodes,
            'anomalous': anomalous,
        },
        'clusters': summaries,
        'selected': {
            **(selected_meta or {
                'id': chosen or 'unclassified',
                'slug': chosen or 'unclassified',
                'title': f'#{chosen or "unclassified"}',
                'desc': 'No clustered claims yet.',
                'claims': 0,
                'nodes': 0,
                'age': '—',
                'trend': 'Stable',
                'style': trend_style('Stable'),
                'metrics': {'velocity': 0, 'cross_platform': 0, 'recycle_risk': 0},
                'flagged': False,
                'matches': 0,
            }),
            'graph': _build_graph(selected_claims, corpus),
            'timeline': _timeline(selected_claims, chosen or 'unclassified', corpus, now),
            'series': series,
            'claims': [_claim_brief(claim, match_validated(claim, corpus)) for claim in selected_claims],
            'validated': [
                {
                    'claim_id': row.claim_id,
                    'text': row.text,
                    'authority': row.authority,
                    'topic': row.topic,
                    'verified_at': row.verified_at.isoformat() if row.verified_at else '',
                    'match_count': row.match_count,
                }
                for row in selected_validated
            ],
        },
    }


RULE_CATALOG = (
    ('WF-NARRATIVE', 'v1', 'Narrative analysis review lead'),
    ('SYNTHETIC-SIG', 'v1.4', 'Synthetic or deepfake indicator on an open claim'),
    ('VALIDATED-DIVERGE', 'v1.2', 'Same topic as a validated record, with a different assertion'),
    ('RECYCLE-MEDIA', 'v3.0', 'Out-of-context or archive-matched media'),
    ('ALERT-ECHO', 'v2.1', 'High repetition count inside 36 hours'),
    ('CLAIM-URGENCY', 'v2.3', 'Unverified claim still waiting on an analyst'),
    ('AMPLIFY-ANOMALY', 'v1.8', 'Two or more open claims in one cluster inside 12 hours'),
)

RULE_TITLES = {
    'SYNTHETIC-SIG': 'Synthetic indicator',
    'VALIDATED-DIVERGE': 'Diverges from validated record',
    'RECYCLE-MEDIA': 'Recycled or out-of-context media',
    'ALERT-ECHO': 'Rapid spread',
    'CLAIM-URGENCY': 'High-urgency unverified claim',
    'AMPLIFY-ANOMALY': 'Amplification pattern',
}

HARM_TERMS = (
    ('evacuat', 28),
    ('কারফিউ', 30),
    ('curfew', 30),
    ('ইন্টারনেট', 22),
    ('shutdown', 22),
    ('election', 16),
    ('তফসিল', 16),
    ('নির্বাচন', 16),
    ('cyclone', 18),
    ('ঘূর্ণিঝড়', 18),
    ('flood', 14),
    ('বন্যা', 14),
    ('synthetic', 18),
    ('protest', 12),
    ('বিক্ষোভ', 12),
    ('audio', 8),
)

CLOSED_STATUSES = {
    Claim.Status.SUPPORTED,
    Claim.Status.REFUTED,
    Claim.Status.SATIRE,
}


def _hours_since(dt, now):
    if not dt:
        return 99
    return max((now - dt).total_seconds() / 3600.0, 0)


def _ago_label(dt, now):
    hours = _hours_since(dt, now)
    if hours < 1:
        return f'{max(int(hours * 60), 1)} min ago'
    if hours < 24:
        whole = int(hours)
        return '1 hr ago' if whole == 1 else f'{whole} hrs ago'
    days = int(hours / 24)
    return '1 day ago' if days == 1 else f'{days} days ago'


def _excerpt(text, limit=84):
    cleaned = re.sub(r'\s+', ' ', (text or '').replace('"', '').replace('“', '').replace('”', '')).strip()
    if len(cleaned) <= limit:
        return cleaned or 'Untitled watch item'
    return cleaned[: limit - 1].rstrip() + '…'


def _jaccard(left, right):
    a = tokens(left)
    b = tokens(right)
    if not a or not b:
        return 0
    return len(a & b) / max(len(a | b), 1)


def _harm_score(text, evidence, status):
    blob = f"{text or ''} {evidence or ''}".lower()
    score = 34
    hits = []
    for term, weight in HARM_TERMS:
        if term.lower() in blob:
            score += weight
            hits.append(term)
    if status == Claim.Status.SYNTHETIC:
        score += 18
        hits.append('synthetic status')
    if status == Claim.Status.OUT_OF_CONTEXT:
        score += 10
        hits.append('out of context')
    return min(99, score), hits[:4]


def _volume_score(matches, peers=0):
    return min(99, 16 + int(matches or 0) * 2 + int(peers or 0) * 6)


def _urgency_score(hours, priority, status):
    if hours < 1:
        base = 94
    elif hours < 6:
        base = 86
    elif hours < 18:
        base = 74
    elif hours < 48:
        base = 56
    else:
        base = 38
    boost = {
        Claim.Priority.CRITICAL: 10,
        Claim.Priority.HIGH: 6,
        Claim.Priority.MEDIUM: 2,
    }.get(priority, 0)
    if status == Claim.Status.UNVERIFIED:
        boost += 4
    return min(99, base + boost)


def _review_priority(volume, urgency, harm):
    return min(99, round(volume * 0.38 + urgency * 0.34 + harm * 0.28))


def _severity(rule_id, score, priority):
    if rule_id == 'SYNTHETIC-SIG' or priority == Claim.Priority.CRITICAL or score >= 82:
        return 'critical'
    if score >= 68 or priority == Claim.Priority.HIGH:
        return 'high'
    if score >= 48:
        return 'medium'
    return 'low'


def _due_label(score, hours):
    if score >= 85 or hours < 2:
        return 'Due now'
    if score >= 72:
        return 'Due in 25 min'
    if score >= 58:
        return 'Due in 1 hr'
    if score >= 45:
        return 'Due in 4 hr'
    return 'Queued'


def _pick_rule(claim, hit, hours):
    blob = f"{claim.text or ''} {claim.evidence or ''}".lower()
    if claim.status == Claim.Status.SYNTHETIC:
        return 'SYNTHETIC-SIG'
    if claim.status == Claim.Status.OUT_OF_CONTEXT or any(hint in blob for hint in RECYCLE_HINTS):
        return 'RECYCLE-MEDIA'
    if (
        hit
        and hit.claim_id != claim.claim_id
        and claim.status in (Claim.Status.UNVERIFIED, Claim.Status.MISLEADING)
        and _jaccard(claim.text, hit.text) < 0.45
    ):
        return 'VALIDATED-DIVERGE'
    if claim.status in (Claim.Status.UNVERIFIED, Claim.Status.MISLEADING) and (claim.match_count or 0) >= 25 and hours <= 36:
        return 'ALERT-ECHO'
    if claim.status == Claim.Status.UNVERIFIED and claim.priority in (
        Claim.Priority.CRITICAL,
        Claim.Priority.HIGH,
        Claim.Priority.MEDIUM,
    ):
        return 'CLAIM-URGENCY'
    if claim.status == Claim.Status.MISLEADING and claim.priority in (Claim.Priority.CRITICAL, Claim.Priority.HIGH):
        return 'CLAIM-URGENCY'
    return None


def _recommendation(rule_id, hit=None):
    if rule_id == 'SYNTHETIC-SIG':
        return 'Open forensic review. The indicator is uncalibrated and is not a fabrication verdict.'
    if rule_id == 'RECYCLE-MEDIA':
        return 'Compare the media with the archive match before treating it as a current event.'
    if rule_id == 'VALIDATED-DIVERGE' and hit:
        return f'Compare the wording with {hit.authority} record {hit.claim_id}. A shared topic is not corroboration.'
    if rule_id == 'ALERT-ECHO':
        return 'Review the repetition count and source mix. Velocity is a triage signal, not a falsity score.'
    if rule_id == 'AMPLIFY-ANOMALY':
        return 'Inspect the cluster timeline. Repeated posts are a hypothesis for review, not proof of coordination.'
    return 'Assign an analyst and check the cited authority before any outward note.'


def _why(rule_id, claim, hours, hit, harm_hits):
    reasons = []
    label = dict((row[0], row[2]) for row in RULE_CATALOG).get(rule_id, rule_id)
    reasons.append(label)
    reasons.append(
        f'{claim.status} · {claim.priority} priority · {claim.match_count or 0} repetitions · first seen {int(hours)}h ago'
    )
    if harm_hits:
        reasons.append('Public-safety or civic wording: ' + ', '.join(harm_hits))
    if hit and rule_id == 'VALIDATED-DIVERGE':
        reasons.append(f'Internal validated record {hit.claim_id} ({hit.authority}) covers this topic with different wording.')
    elif hit:
        reasons.append(f'Internal validated record {hit.claim_id} ({hit.authority}) is a comparison pointer only.')
    else:
        reasons.append('No validated record is close enough to treat this as corroborated.')
    return reasons


def assign_alert(alert_key, assignee):
    state, _created = AlertState.objects.update_or_create(
        alert_key=alert_key,
        defaults={'assignee': assignee or ''},
    )
    return state


def build_alert_analysis(selected_id=None, operator=''):
    now = timezone.now()
    rebuild_clusters()
    corpus = list(ValidatedClaim.objects.filter(is_active=True))
    claims = list(Claim.objects.all())
    by_cluster = {}
    for claim in claims:
        by_cluster.setdefault(claim.cluster or 'unclassified', []).append(claim)
    assignees = {row.alert_key: row.assignee for row in AlertState.objects.all()}
    operator_key = (operator or '').strip().lower()

    alerts = []
    suppressed = 0

    def push(alert):
        assignee = assignees.get(alert['id'], '')
        alert['assignee'] = assignee
        alert['mine'] = bool(assignee) and assignee.strip().lower() == operator_key
        alert['meta'] = f"{alert.get('ref') or alert['id']} · {assignee or 'Unassigned'}"
        alerts.append(alert)

    from .models import WorkflowAlert
    for saved in WorkflowAlert.objects.filter(is_active=True).select_related('claim'):
        claim = saved.claim
        hours = _hours_since(saved.updated_at, now)
        push({
            'id': f'WF-{claim.pk}', 'sev': saved.severity,
            'title': f'Narrative review: {_excerpt(claim.text)}', 'desc': saved.summary,
            'rule': 'WF-NARRATIVE · v1', 'rule_id': 'WF-NARRATIVE',
            'time': _ago_label(saved.updated_at, now), 'due': 'Analyst review requested',
            'ref': claim.claim_id, 'score': {'low': 25, 'medium': 50, 'high': 75, 'critical': 95}.get(saved.severity, 50),
            'hours': hours, 'matches': claim.match_count, 'claim_id': claim.claim_id,
            'cluster': claim.cluster, 'status': claim.status, 'priority': claim.priority,
            'platform': infer_platform(claim.source, claim.url), 'source': claim.source,
            'factors': [], 'why': saved.reasons, 'recommendation': 'Review the narrative analysis and cited investigation evidence. This is an urgency lead, not a verdict.',
            'validated': None, 'related': [],
        })

    for claim in claims:
        if claim.status in CLOSED_STATUSES:
            suppressed += 1
            continue
        hours = _hours_since(claim.first_seen, now)
        hit = match_validated(claim, corpus)
        rule_id = _pick_rule(claim, hit, hours)
        if not rule_id:
            suppressed += 1
            continue
        peers = max(len(by_cluster.get(claim.cluster or 'unclassified', [])) - 1, 0)
        volume = _volume_score(claim.match_count, peers)
        urgency = _urgency_score(hours, claim.priority, claim.status)
        harm, harm_hits = _harm_score(claim.text, claim.evidence, claim.status)
        score = _review_priority(volume, urgency, harm)
        version = next(row[1] for row in RULE_CATALOG if row[0] == rule_id)
        reasons = _why(rule_id, claim, hours, hit, harm_hits)
        push({
            'id': claim.claim_id,
            'sev': _severity(rule_id, score, claim.priority),
            'title': f'{RULE_TITLES[rule_id]}: {_excerpt(claim.text)}',
            'desc': reasons[0],
            'rule': f'{rule_id} · {version}',
            'rule_id': rule_id,
            'time': _ago_label(claim.first_seen, now),
            'due': _due_label(score, hours),
            'ref': claim.claim_id,
            'score': score,
            'hours': round(hours, 1),
            'matches': claim.match_count or 0,
            'claim_id': claim.claim_id,
            'cluster': claim.cluster,
            'status': claim.status,
            'priority': claim.priority,
            'platform': infer_platform(claim.source, claim.url),
            'source': claim.source,
            'factors': [
                {'label': 'Volume', 'score': volume, 'note': f'{claim.match_count or 0} repetitions · {peers} other claims in this cluster'},
                {'label': 'Urgency', 'score': urgency, 'note': f'{claim.priority} · {claim.status} · {_ago_label(claim.first_seen, now)}'},
                {'label': 'Harm potential', 'score': harm, 'note': ', '.join(harm_hits) if harm_hits else 'No public-safety wording detected'},
            ],
            'why': reasons,
            'recommendation': _recommendation(rule_id, hit),
            'validated': {
                'claim_id': hit.claim_id,
                'authority': hit.authority,
                'text': hit.text,
                'diverges': rule_id == 'VALIDATED-DIVERGE',
            } if hit else None,
            'related': [
                {
                    'claim_id': other.claim_id,
                    'text': _excerpt(other.text, 140),
                    'status': other.status,
                    'priority': other.priority,
                }
                for other in by_cluster.get(claim.cluster or 'unclassified', [])
                if other.claim_id != claim.claim_id
            ][:4],
        })

    for slug, grouped in by_cluster.items():
        recent = [row for row in grouped if row.status not in CLOSED_STATUSES and _hours_since(row.first_seen, now) <= 12]
        if len(recent) < 2:
            continue
        latest = max((row.first_seen for row in recent if row.first_seen), default=now)
        hours = _hours_since(latest, now)
        matches = sum(row.match_count or 0 for row in recent)
        volume = _volume_score(matches, len(recent))
        urgency = _urgency_score(hours, Claim.Priority.HIGH, Claim.Status.UNVERIFIED)
        harm, harm_hits = _harm_score(' '.join(row.text for row in recent), '', '')
        score = _review_priority(volume, urgency, harm)
        platforms = sorted({infer_platform(row.source, row.url) for row in recent})
        push({
            'id': f'AMP-{slug}',
            'sev': _severity('AMPLIFY-ANOMALY', score, Claim.Priority.HIGH),
            'title': f'{RULE_TITLES["AMPLIFY-ANOMALY"]}: #{slug}',
            'desc': f'{len(recent)} open claims in 12 hours across {len(platforms)} platforms.',
            'rule': 'AMPLIFY-ANOMALY · v1.8',
            'rule_id': 'AMPLIFY-ANOMALY',
            'time': _ago_label(latest, now),
            'due': _due_label(score, hours),
            'ref': f'#{slug}',
            'score': score,
            'hours': round(hours, 1),
            'matches': matches,
            'claim_id': recent[0].claim_id,
            'cluster': slug,
            'status': 'Cluster',
            'priority': 'High',
            'platform': ', '.join(platforms),
            'source': f'{len(recent)} claims',
            'factors': [
                {'label': 'Volume', 'score': volume, 'note': f'{matches} repetitions across {len(recent)} claims'},
                {'label': 'Urgency', 'score': urgency, 'note': 'Newest claim inside the 12-hour window'},
                {'label': 'Harm potential', 'score': harm, 'note': ', '.join(harm_hits) if harm_hits else 'No public-safety wording detected'},
            ],
            'why': [
                'Two or more open claims in one cluster inside 12 hours',
                f'Platforms: {", ".join(platforms)}',
                'Repeated posts are a hypothesis for review, not proof of coordination.',
            ],
            'recommendation': _recommendation('AMPLIFY-ANOMALY'),
            'validated': None,
            'related': [
                {
                    'claim_id': row.claim_id,
                    'text': _excerpt(row.text, 140),
                    'status': row.status,
                    'priority': row.priority,
                }
                for row in recent
            ][:6],
        })

    rank = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    alerts.sort(key=lambda row: (rank.get(row['sev'], 9), -row['score'], row['id']))
    chosen = selected_id if selected_id in {row['id'] for row in alerts} else (alerts[0]['id'] if alerts else '')
    selected = next((row for row in alerts if row['id'] == chosen), None)
    fired = {}
    for row in alerts:
        fired[row['rule_id']] = fired.get(row['rule_id'], 0) + 1

    return {
        'overview': {
            'active': len(alerts),
            'critical': sum(1 for row in alerts if row['sev'] == 'critical'),
            'high': sum(1 for row in alerts if row['sev'] == 'high'),
            'triggered_today': sum(1 for row in alerts if row['hours'] < 24),
            'unassigned': sum(1 for row in alerts if not row['assignee']),
            'mine': sum(1 for row in alerts if row['mine']),
            'rules': len(fired),
            'suppressed': suppressed,
            'repetitions': sum(row['matches'] for row in alerts if not str(row['id']).startswith('AMP-')),
        },
        'rules': [
            {
                'id': rule_id,
                'version': version,
                'label': label,
                'count': fired.get(rule_id, 0),
                'active': fired.get(rule_id, 0) > 0,
            }
            for rule_id, version, label in RULE_CATALOG
        ],
        'alerts': alerts,
        'selected': selected,
    }
