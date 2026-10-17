from datetime import timedelta

from django.utils import timezone

from .models import Content, Country, FacebookPage, Keyword, Publisher
from .nlp import categorize_news, classify_sentiment, summarize

PUBLISHERS = [
    {'name': 'Prothom Alo', 'url': 'https://www.prothomalo.com/', 'search_url': 'https://www.prothomalo.com/search?q={keyword}', 'link_element': 'a.title-link'},
    {'name': 'The Daily Star', 'url': 'https://www.thedailystar.net/', 'search_url': 'https://www.thedailystar.net/sitemap.xml', 'link_element': '.card-title a'},
    {'name': 'Bangladesh Pratidin', 'url': 'https://www.bd-pratidin.com/', 'search_url': '', 'link_element': "a[href*='/20']"},
    {'name': 'The Daily Ittefaq', 'url': 'https://www.ittefaq.com.bd/', 'search_url': 'https://www.ittefaq.com.bd/search?q={keyword}', 'link_element': 'h2 a'},
    {'name': 'Kaler Kantho', 'url': 'https://www.kalerkantho.com/', 'search_url': 'https://www.kalerkantho.com/search?q={keyword}', 'link_element': 'h2 a'},
    {'name': 'Daily Naya Diganta', 'url': 'https://dailynayadiganta.com/', 'search_url': '', 'link_element': 'a.post-card-title'},
    {'name': 'Amar Sangbad', 'url': 'https://www.amarsangbad.com/', 'search_url': '', 'link_element': "a[href*='/news/']"},
    {'name': 'Jugantor', 'url': 'https://www.jugantor.com/', 'search_url': '', 'link_element': 'h2 a'},
    {'name': 'Samakal', 'url': 'https://samakal.com/', 'search_url': '', 'link_element': "a[href*='/article/']"},
    {'name': 'Dhaka Tribune', 'url': 'https://www.dhakatribune.com/', 'search_url': 'https://www.dhakatribune.com/search?q={keyword}', 'link_element': 'h2 a'},
    {'name': 'The Business Standard', 'url': 'https://www.tbsnews.net/', 'search_url': 'https://www.tbsnews.net/search?q={keyword}', 'link_element': 'h2 a'},
    {'name': 'BDNews24', 'url': 'https://bdnews24.com/', 'search_url': 'https://bdnews24.com/search?q={keyword}', 'link_element': 'h2 a'},
    {'name': 'Bonik Barta', 'url': 'https://www.bonikbarta.com/', 'search_url': '', 'link_element': 'h2 a'},
    {'name': 'Manab Zamin', 'url': 'https://www.mzamin.com/', 'search_url': '', 'link_element': 'h3 a'},
]

COUNTRIES = [
    ('Bangladesh', '🇧🇩', 'BD'),
    ('India', '🇮🇳', 'IN'),
    ('United States', '🇺🇸', 'US'),
    ('United Kingdom', '🇬🇧', 'GB'),
    ('China', '🇨🇳', 'CN'),
]

KEYWORDS = ['Bangladesh', 'Dhaka', 'election', 'flood', 'internet', 'inflation', 'বাংলাদেশ']

FACEBOOK = [
    {'name': 'Prothom Alo', 'page_id': 'prothomalo', 'category': 'Politics'},
    {'name': 'The Daily Star', 'page_id': 'dailystarnews', 'category': 'Politics'},
    {'name': 'Dhaka Tribune', 'page_id': 'dhakatribune', 'category': 'Politics'},
    {'name': 'The Business Standard', 'page_id': 'tbsnews.net', 'category': 'Business'},
    {'name': 'Prothom Alo Sports', 'page_id': 'prothomalosports', 'category': 'Sports'},
]

SAMPLES = [
    ('Nationwide internet disruption rumour circulates ahead of morning hours', 'Prothom Alo', 'A ministry notice claiming a six-hour nationwide shutdown was widely shared before official denial.', 'https://example.com/ns/internet-notice', 'Negative', 'Technology', 'internet'),
    ('BBS inflation print rises to 9.7 percent in September', 'The Business Standard', 'Official statistics office and two wire services published matching inflation figures.', 'https://example.com/ns/inflation-97', 'Neutral', 'Business', 'inflation'),
    ('Padma Bridge closure claim uses 2019 construction photograph', 'The Daily Star', 'A viral image alleging structural failure was matched to an archived construction photo.', 'https://example.com/ns/padma-photo', 'Negative', 'Politics', 'Bangladesh'),
    ('Dhaka cricket stadium host schedule confirmed for home series', 'Dhaka Tribune', 'Sports authorities published a confirmed fixture list for the upcoming home series.', 'https://example.com/ns/cricket-host', 'Positive', 'Sports', 'Dhaka'),
    ('Relief boats deployed as northern flood water recedes slowly', 'Kaler Kantho', 'Local administrations reported water levels falling after three days of rain.', 'https://example.com/ns/flood-relief', 'Positive', 'General', 'flood'),
    ('Cabinet audio circulating on messaging apps flagged as synthetic', 'BDNews24', 'Public clips claiming a curfew announcement failed basic synthesis checks.', 'https://example.com/ns/cabinet-audio', 'Negative', 'Politics', 'election'),
    ('Port congestion eases after weekend container backlog', 'The Business Standard', 'Chattogram authorities said dwell times fell after extra shifts at two terminals.', 'https://example.com/ns/port-congestion', 'Positive', 'Business', 'Bangladesh'),
    ('School calendar rumour claims unexpected midweek closure', 'Prothom Alo', 'Education offices said no nationwide holiday had been issued for the circulated date.', 'https://example.com/ns/school-calendar', 'Negative', 'General', 'Dhaka'),
    ('River island clinics report medicine shortfalls after flood', 'Samakal', 'Health workers requested restock of oral rehydration and antibiotics in three upazilas.', 'https://example.com/ns/clinic-shortfall', 'Negative', 'Health', 'flood'),
    ('Export orders for knitwear rise ahead of winter shipment', 'Bonik Barta', 'Factory groups cited stronger European restocking compared with the previous quarter.', 'https://example.com/ns/knitwear-orders', 'Positive', 'Business', 'Bangladesh'),
    ('Election commission briefing restates polling-day phone guidance', 'The Daily Star', 'Officials repeated that unofficial result graphics should not be treated as certified counts.', 'https://example.com/ns/ec-briefing', 'Neutral', 'Politics', 'election'),
    ('Tech parks report stable power after planned grid work', 'Dhaka Tribune', 'Operators said scheduled maintenance did not interrupt campus connectivity.', 'https://example.com/ns/tech-park-power', 'Positive', 'Technology', 'internet'),
    ('Food price watch notes stable rice, firmer edible oil', 'Jugantor', 'Market reporters recorded mixed wholesale moves across Dhaka kitchen markets.', 'https://example.com/ns/food-price-watch', 'Neutral', 'Business', 'inflation'),
    ('Coastal warning shared from last monsoon is recirculated', 'Manab Zamin', 'Meteorology staff said the viral map belonged to a previous storm season.', 'https://example.com/ns/coastal-warning', 'Negative', 'General', 'flood'),
    ('University admission circular confirmed for next session', 'The Daily Ittefaq', 'The published schedule matched the education board notice posted the same morning.', 'https://example.com/ns/admission-circular', 'Neutral', 'General', 'Dhaka'),
]


def seed_gpob():
    country_map = {}
    for name, flag, code in COUNTRIES:
        country, _ = Country.objects.get_or_create(name=name, defaults={'flag': flag, 'code': code})
        country.flag = flag
        country.code = code
        country.save(update_fields=['flag', 'code'])
        country_map[name] = country

    bangladesh = country_map['Bangladesh']
    for spec in PUBLISHERS:
        Publisher.objects.get_or_create(
            name=spec['name'],
            country=bangladesh,
            defaults={
                'url': spec['url'],
                'search_url': spec.get('search_url', ''),
                'link_element': spec.get('link_element', 'a'),
                'title_element': 'h1',
                'content_element': 'article',
                'date_element': 'time',
            },
        )

    for term in KEYWORDS:
        Keyword.objects.get_or_create(term=term, defaults={'is_active': True})

    for spec in FACEBOOK:
        FacebookPage.objects.get_or_create(
            page_id=spec['page_id'],
            defaults={'name': spec['name'], 'category': spec['category'], 'country': bangladesh, 'is_active': True},
        )

    today = timezone.now().date()
    created = 0
    for offset, (title, pub_name, body, url, sentiment, category, keyword) in enumerate(SAMPLES):
        publisher = Publisher.objects.filter(name=pub_name).first() or Publisher.objects.filter(country=bangladesh).first()
        _, was_created = Content.objects.get_or_create(
            url=url,
            defaults={
                'title': title,
                'publisher': publisher,
                'body': body,
                'publication_date': today - timedelta(days=offset),
                'country': bangladesh,
                'summary': summarize(body),
                'sentiment': sentiment or classify_sentiment(body),
                'category': category or categorize_news(body),
                'matched_keyword': keyword,
                'source_kind': 'seed',
            },
        )
        if was_created:
            created += 1
    return {
        'countries': Country.objects.count(),
        'publishers': Publisher.objects.count(),
        'keywords': Keyword.objects.count(),
        'pages': FacebookPage.objects.count(),
        'articles': Content.objects.count(),
        'new_articles': created,
    }
