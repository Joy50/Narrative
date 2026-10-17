from datetime import timedelta

from django.utils import timezone

from .models import Claim, NarrativeCluster, SourceFeed, ValidatedClaim
from .services import rebuild_clusters

CLAIMS = [
    {
        'claim_id': 'CL-2025-8842',
        'language': 'বাংলা',
        'source': 'Prothom Alo · public post',
        'first_seen_hours': 15,
        'match_count': 84,
        'priority': Claim.Priority.HIGH,
        'status': Claim.Status.UNVERIFIED,
        'analyst': 'A. Rahman',
        'evidence': 'No official notice found. Spread velocity is a triage signal, not a falsity score.',
        'text': '"আগামীকাল সকাল ৬টা থেকে সারাদেশে ইন্টারনেট বন্ধ থাকবে" — একটি স্বরাষ্ট্র মন্ত্রণালয়ের নোটিশ দাবি করে ভাইরাল।',
        'url': 'facebook.com/…/posts/8421',
        'cluster': 'internet-shutdown',
        'filters': ['Bangla', 'Unreviewed', 'High'],
    },
    {
        'claim_id': 'CL-2025-8836',
        'language': 'English',
        'source': 'X / Twitter · image',
        'first_seen_hours': 16,
        'match_count': 41,
        'priority': Claim.Priority.MEDIUM,
        'status': Claim.Status.MISLEADING,
        'analyst': 'M. Hossain',
        'evidence': 'Still matched to a 2019 construction photograph in the archive.',
        'text': '"BREAKING: Padma Bridge closed indefinitely due to structural crack." — image shows a 2019 construction photo.',
        'url': 'x.com/…/status/8812',
        'cluster': 'padma-bridge',
        'filters': ['English', 'Media'],
    },
    {
        'claim_id': 'CL-2025-8829',
        'language': 'Banglish',
        'source': 'TikTok · video',
        'first_seen_hours': 19,
        'match_count': 27,
        'priority': Claim.Priority.MEDIUM,
        'status': Claim.Status.OUT_OF_CONTEXT,
        'analyst': 'N. Ferdous',
        'evidence': 'Geolocation and clothing match a 2023 Chattogram rally, not a current Dhaka event.',
        'text': '"Dhaka te aaj massive protest, police chole gese!" — video actually from a 2023 political rally in Chattogram.',
        'url': 'tiktok.com/@user/video/9921',
        'cluster': 'protest-recycle',
        'filters': ['Banglish', 'Media'],
    },
    {
        'claim_id': 'CL-2025-8817',
        'language': 'বাংলা',
        'source': 'Forwarded audio · 4 groups',
        'first_seen_hours': 21,
        'match_count': 19,
        'priority': Claim.Priority.CRITICAL,
        'status': Claim.Status.SYNTHETIC,
        'analyst': 'S. Karim',
        'evidence': 'Forensic indicator 0.81 (uncalibrated). Treat as a lead, not proof of fabrication.',
        'text': '"প্রধানমন্ত্রীর অডিও বার্তা: \'আগামী সপ্তাহে কারফিউ জারি হবে\'" — অডিওটি সিন্থেটিক সূচক দেখায়।',
        'url': 'forwarded audio',
        'cluster': 'cabinet-audio',
        'filters': ['Bangla', 'High', 'Media'],
    },
    {
        'claim_id': 'CL-2025-8801',
        'language': 'English',
        'source': 'Medium · blog',
        'first_seen_hours': 26,
        'match_count': 8,
        'priority': Claim.Priority.LOW,
        'status': Claim.Status.SUPPORTED,
        'analyst': 'A. Rahman',
        'evidence': 'Corroborated by BBS release and Reuters. Citation stored in the case file.',
        'text': '"Bangladesh\'s inflation rate rose to 9.7% in September 2025, according to BBS data."',
        'url': 'medium.com/…/inflation-2025',
        'cluster': 'inflation',
        'filters': ['English'],
    },
    {
        'claim_id': 'CL-2025-8794',
        'language': 'English',
        'source': 'Public Telegram channel',
        'first_seen_hours': 6,
        'match_count': 33,
        'priority': Claim.Priority.HIGH,
        'status': Claim.Status.UNVERIFIED,
        'analyst': 'N. Ferdous',
        'evidence': 'No BMD bulletin number cited. Treat weather-alert claims as high-urgency review items.',
        'text': 'A forwarded post says Cox’s Bazar must evacuate tonight because a cyclone warning was secretly cancelled.',
        'url': 't.me/publicchannel/4412',
        'cluster': 'cyclone-warning',
        'filters': ['English', 'Unreviewed', 'High'],
    },
    {
        'claim_id': 'CL-2025-8788',
        'language': 'বাংলা',
        'source': 'Facebook public page',
        'first_seen_hours': 9,
        'match_count': 22,
        'priority': Claim.Priority.MEDIUM,
        'status': Claim.Status.UNVERIFIED,
        'analyst': 'S. Karim',
        'evidence': 'Schedule claims should be checked against the Election Commission gazette before any public statement.',
        'text': 'একটি পোস্ট দাবি করেছে যে তফসিল বাতিল হয়ে গেছে এবং ভোট এক সপ্তাহ পিছিয়ে যাবে।',
        'url': 'facebook.com/…/posts/7710',
        'cluster': 'election-schedule',
        'filters': ['Bangla', 'Unreviewed'],
    },
]

VALIDATED_CLAIMS = [
    {
        'claim_id': 'CL-2025-8801',
        'text': "Bangladesh's inflation rate rose to 9.7% in September 2025, according to BBS data.",
        'language': 'English',
        'topic': 'inflation',
        'authority': 'Bangladesh Bureau of Statistics',
        'corroborators': 'Reuters · The Business Standard',
        'source_url': 'https://example.com/ns/inflation-97',
        'evidence': 'Official BBS release matches wire copy. Human-reviewed and stored as a valid comparison record.',
        'verified_by': 'A. Rahman',
        'days_ago': 2,
        'match_count': 8,
    },
    {
        'claim_id': 'CL-2025-8764',
        'text': 'BMD issued a cyclone warning for coastal Cox’s Bazar and advised fishing vessels to return to harbor.',
        'language': 'English',
        'topic': 'cyclone-warning',
        'authority': 'Bangladesh Meteorological Department',
        'corroborators': 'Prothom Alo · Dhaka Tribune',
        'source_url': 'https://example.com/ns/bmd-warning',
        'evidence': 'Warning number and valid-until window match the BMD bulletin. Used as a valid weather-alert reference.',
        'verified_by': 'N. Ferdous',
        'days_ago': 5,
        'match_count': 14,
    },
    {
        'claim_id': 'CL-2025-8722',
        'text': 'জাতীয় নির্বাচনের তফসিল নির্বাচন কমিশন কর্তৃক প্রকাশিত সূচি অনুযায়ী নির্ধারিত হয়েছে।',
        'language': 'বাংলা',
        'topic': 'election-schedule',
        'authority': 'Bangladesh Election Commission',
        'corroborators': 'BSS · The Daily Star',
        'source_url': 'https://example.com/ns/ec-schedule',
        'evidence': 'Gazette date and constituency list match the Commission release. Marked valid for schedule claims.',
        'verified_by': 'M. Hossain',
        'days_ago': 8,
        'match_count': 21,
    },
    {
        'claim_id': 'CL-2025-8690',
        'text': 'The FY budget speech listed the announced social-protection allocation published by the Ministry of Finance.',
        'language': 'English',
        'topic': 'budget-allocation',
        'authority': 'Ministry of Finance',
        'corroborators': 'The Business Standard · Bonik Barta',
        'source_url': 'https://example.com/ns/mof-budget',
        'evidence': 'Figure taken from the published budget speech table. Valid for allocation comparisons only.',
        'verified_by': 'S. Karim',
        'days_ago': 11,
        'match_count': 6,
    },
    {
        'claim_id': 'CL-2025-8611',
        'text': 'DGHS reported national COVID-19 booster coverage for the stated reporting week.',
        'language': 'English',
        'topic': 'vaccination-coverage',
        'authority': 'Directorate General of Health Services',
        'corroborators': 'UNB · Prothom Alo',
        'source_url': 'https://example.com/ns/dghs-booster',
        'evidence': 'Weekly epi bulletin numbers match the DGHS table. Stored as a valid health-stat record.',
        'verified_by': 'A. Rahman',
        'days_ago': 14,
        'match_count': 4,
    },
    {
        'claim_id': 'CL-2025-8540',
        'text': 'Bangladesh Bank published the current policy rate in its latest monetary-policy circular.',
        'language': 'English',
        'topic': 'policy-rate',
        'authority': 'Bangladesh Bank',
        'corroborators': 'Reuters · The Daily Star',
        'source_url': 'https://example.com/ns/bb-rate',
        'evidence': 'Circular number and rate match the central-bank PDF. Valid reference for rate claims.',
        'verified_by': 'M. Hossain',
        'days_ago': 18,
        'match_count': 9,
    },
    {
        'claim_id': 'CL-2025-8488',
        'text': 'Dhaka cricket stadium host schedule confirmed for the upcoming home series.',
        'language': 'English',
        'topic': 'cricket-fixtures',
        'authority': 'Bangladesh Cricket Board',
        'corroborators': 'Dhaka Tribune · TSports',
        'source_url': 'https://example.com/ns/cricket-host',
        'evidence': 'Fixture list published by BCB. Valid for date-and-venue claims on that series.',
        'verified_by': 'N. Ferdous',
        'days_ago': 21,
        'match_count': 3,
    },
    {
        'claim_id': 'CL-2025-8412',
        'text': 'উত্তরাঞ্চলে বন্যা পরিস্থিতি স্থানীয় প্রশাসনের প্রতিবেদন অনুযায়ী ধীরে ধীরে উন্নতি করছে।',
        'language': 'বাংলা',
        'topic': 'flood-recede',
        'authority': 'Ministry of Disaster Management and Relief',
        'corroborators': 'Kaler Kantho · BSS',
        'source_url': 'https://example.com/ns/flood-relief',
        'evidence': 'District situation reports list falling water levels. Valid for receding-flood claims in named districts.',
        'verified_by': 'S. Karim',
        'days_ago': 24,
        'match_count': 11,
    },
]

SOURCES = [
    ('Prothom Alo RSS', 'rss', 'Healthy', False, 1),
    ('BDNews24 RSS', 'rss', 'Healthy', False, 2),
    ('Facebook public pages', 'social', 'Healthy', False, 3),
    ('X / Twitter API', 'api', 'Rate limited', False, 4),
    ('Internal claim database · validated', 'internal', 'Healthy', True, 5),
]

CLUSTERS = [
    ('internet-shutdown', '#internet-shutdown', 84, 'Growing'),
    ('padma-bridge', '#padma-bridge', 41, 'Stable'),
    ('cabinet-audio', '#cabinet-audio', 19, 'Spiking'),
]


def seed_rumor():
    now = timezone.now()
    today = now.date()
    claims_created = 0
    for spec in CLAIMS:
        _, created = Claim.objects.get_or_create(
            claim_id=spec['claim_id'],
            defaults={
                'text': spec['text'],
                'language': spec['language'],
                'source': spec['source'],
                'url': spec['url'],
                'cluster': spec['cluster'],
                'first_seen': now - timedelta(hours=spec['first_seen_hours']),
                'match_count': spec['match_count'],
                'priority': spec['priority'],
                'status': spec['status'],
                'analyst': spec['analyst'],
                'evidence': spec['evidence'],
                'filters': spec['filters'],
                'review_score': 76 if spec['priority'] in (Claim.Priority.HIGH, Claim.Priority.CRITICAL) else 48,
                'notes': '',
                'intake_kind': 'seed',
            },
        )
        if created:
            claims_created += 1

    valid_created = 0
    for spec in VALIDATED_CLAIMS:
        _, created = ValidatedClaim.objects.get_or_create(
            claim_id=spec['claim_id'],
            defaults={
                'text': spec['text'],
                'language': spec['language'],
                'topic': spec['topic'],
                'authority': spec['authority'],
                'corroborators': spec['corroborators'],
                'source_url': spec['source_url'],
                'verdict': 'Supported',
                'evidence': spec['evidence'],
                'verified_by': spec['verified_by'],
                'verified_at': today - timedelta(days=spec['days_ago']),
                'match_count': spec['match_count'],
                'is_active': True,
            },
        )
        if created:
            valid_created += 1

    for name, kind, status, is_internal, order in SOURCES:
        SourceFeed.objects.get_or_create(
            name=name,
            defaults={'kind': kind, 'status': status, 'is_internal': is_internal, 'is_active': True, 'sort_order': order},
        )

    for slug, label, count, trend in CLUSTERS:
        NarrativeCluster.objects.get_or_create(
            slug=slug,
            defaults={'label': label, 'post_count': count, 'trend': trend},
        )

    rebuild_clusters()
    return {
        'claims': Claim.objects.count(),
        'new_claims': claims_created,
        'validated_claims': ValidatedClaim.objects.count(),
        'new_validated_claims': valid_created,
        'sources': SourceFeed.objects.count(),
        'clusters': NarrativeCluster.objects.count(),
    }
