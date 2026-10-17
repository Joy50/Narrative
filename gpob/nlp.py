POSITIVE = (
    'peace', 'growth', 'success', 'support', 'improve', 'recovery', 'aid',
    'agreement', 'progress', 'stable', 'rescue', 'win', 'relief',
)
NEGATIVE = (
    'crisis', 'attack', 'kill', 'flood', 'crash', 'protest', 'war', 'scam',
    'violence', 'shutdown', 'curfew', 'collapse', 'death', 'fraud', 'riot',
)
CATEGORY_RULES = {
    'Politics': ('election', 'minister', 'parliament', 'government', 'party', 'vote', 'cabinet'),
    'Sports': ('cricket', 'football', 'match', 'tournament', 'goal', 'fifa'),
    'Technology': ('internet', 'cyber', 'software', 'ai', 'digital', 'tech'),
    'Business': ('bank', 'inflation', 'market', 'trade', 'economy', 'export'),
    'Health': ('hospital', 'covid', 'vaccine', 'health', 'disease'),
    'Science': ('climate', 'research', 'space', 'scientist'),
    'Entertainment': ('film', 'movie', 'music', 'celebrity', 'drama'),
}

ALIASES = {
    'bangladesh': ('বাংলাদেশ', 'bd'),
    'dhaka': ('ঢাকা',),
    'election': ('নির্বাচন',),
    'flood': ('বন্যা',),
}


def classify_sentiment(text):
    blob = (text or '').lower()
    pos = sum(1 for word in POSITIVE if word in blob)
    neg = sum(1 for word in NEGATIVE if word in blob)
    if pos > neg:
        return 'Positive'
    if neg > pos:
        return 'Negative'
    return 'Neutral'


def categorize_news(text):
    blob = (text or '').lower()
    for category, words in CATEGORY_RULES.items():
        if any(word in blob for word in words):
            return category
    return 'General'


def match_keyword(text, keywords):
    blob = (text or '').lower()
    for term in keywords:
        needle = term.lower()
        aliases = ALIASES.get(needle, ())
        if needle in blob or any(alias in blob for alias in aliases):
            return term
    return ''


def summarize(text, limit=240):
    clean = ' '.join((text or '').split())
    if len(clean) <= limit:
        return clean
    return clean[: limit - 1].rsplit(' ', 1)[0] + '…'
