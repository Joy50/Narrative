import hashlib
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify

from rumor.models import Claim

from .models import CaseEvent, InvestigationCase

STATE_META = {
    InvestigationCase.State.NEW: ('NEW', 's-new'),
    InvestigationCase.State.TRIAGED: ('TRIAGED', 's-triaged'),
    InvestigationCase.State.IN_ANALYSIS: ('IN_ANALYSIS', 's-analysis'),
    InvestigationCase.State.ANALYST_REVIEW: ('ANALYST REVIEW', 's-analyst-review'),
    InvestigationCase.State.SUPERVISOR_REVIEW: ('SUPERVISOR REVIEW', 's-supervisor'),
    InvestigationCase.State.APPROVED: ('APPROVED', 's-approved'),
    InvestigationCase.State.PUBLISHED: ('PUBLISHED', 's-published'),
    InvestigationCase.State.NEEDS_MORE_EVIDENCE: ('NEEDS_MORE_EVIDENCE', 's-needs-evidence'),
    InvestigationCase.State.REOPENED: ('REOPENED', 's-reopened'),
    InvestigationCase.State.CLOSED: ('CLOSED', 's-archived'),
}

PRIORITY_CLASS = {
    InvestigationCase.Priority.CRITICAL: 'prio-critical',
    InvestigationCase.Priority.HIGH: 'prio-high',
    InvestigationCase.Priority.NORMAL: 'prio-normal',
    InvestigationCase.Priority.LOW: 'prio-low',
}

AVATARS = {
    'A. Rahman': '',
    'S. Karim': 'a2',
    'M. Hossain': 'a3',
    'N. Ferdous': 'a4',
}

TRANSITIONS = {
    InvestigationCase.State.NEW: {
        'triage': InvestigationCase.State.TRIAGED,
        'start_analysis': InvestigationCase.State.IN_ANALYSIS,
        'close': InvestigationCase.State.CLOSED,
    },
    InvestigationCase.State.TRIAGED: {
        'start_analysis': InvestigationCase.State.IN_ANALYSIS,
        'request_evidence': InvestigationCase.State.NEEDS_MORE_EVIDENCE,
        'close': InvestigationCase.State.CLOSED,
    },
    InvestigationCase.State.IN_ANALYSIS: {
        'submit_review': InvestigationCase.State.ANALYST_REVIEW,
        'request_evidence': InvestigationCase.State.NEEDS_MORE_EVIDENCE,
    },
    InvestigationCase.State.ANALYST_REVIEW: {
        'escalate': InvestigationCase.State.SUPERVISOR_REVIEW,
        'request_evidence': InvestigationCase.State.NEEDS_MORE_EVIDENCE,
        'return_analysis': InvestigationCase.State.IN_ANALYSIS,
    },
    InvestigationCase.State.SUPERVISOR_REVIEW: {
        'approve': InvestigationCase.State.APPROVED,
        'request_evidence': InvestigationCase.State.NEEDS_MORE_EVIDENCE,
        'return_review': InvestigationCase.State.ANALYST_REVIEW,
    },
    InvestigationCase.State.APPROVED: {
        'publish': InvestigationCase.State.PUBLISHED,
        'reopen': InvestigationCase.State.REOPENED,
    },
    InvestigationCase.State.PUBLISHED: {
        'reopen': InvestigationCase.State.REOPENED,
    },
    InvestigationCase.State.NEEDS_MORE_EVIDENCE: {
        'start_analysis': InvestigationCase.State.IN_ANALYSIS,
        'triage': InvestigationCase.State.TRIAGED,
    },
    InvestigationCase.State.REOPENED: {
        'start_analysis': InvestigationCase.State.IN_ANALYSIS,
        'submit_review': InvestigationCase.State.ANALYST_REVIEW,
    },
    InvestigationCase.State.CLOSED: {
        'reopen': InvestigationCase.State.REOPENED,
    },
}

ACTION_LABELS = {
    'opened': 'Case opened',
    'triage': 'Marked triaged',
    'start_analysis': 'Analysis started',
    'submit_review': 'Submitted for analyst review',
    'escalate': 'Escalated to supervisor',
    'approve': 'Approved',
    'publish': 'Published',
    'request_evidence': 'More evidence requested',
    'return_analysis': 'Returned to analysis',
    'return_review': 'Returned to analyst review',
    'reopen': 'Reopened',
    'close': 'Closed',
    'assign': 'Assignee updated',
    'notes': 'Notes updated',
    'edited': 'Case details updated',
}


class TransitionError(Exception):
    pass


class ClaimNotFound(Exception):
    pass


def operator_name(user):
    profile = getattr(user, 'profile', None)
    if profile and profile.display_name:
        return profile.display_name
    if user and getattr(user, 'username', None):
        return user.username
    return ''


def relative_time(dt):
    if not dt:
        return ''
    seconds = max(0, int((timezone.now() - dt).total_seconds()))
    if seconds < 60:
        return 'just now'
    if seconds < 3600:
        return f'{seconds // 60} min ago'
    if seconds < 86400:
        hours = seconds // 3600
        return '1h ago' if hours == 1 else f'{hours}h ago'
    days = seconds // 86400
    return '1d ago' if days == 1 else f'{days}d ago'


def avatar_class(name):
    if name in AVATARS:
        return AVATARS[name]
    if not name:
        return ''
    palette = ['', 'a2', 'a3', 'a4']
    return palette[sum(ord(char) for char in name) % 4]


def summary_label(case):
    base = case.summary or 'Investigation'
    count = case.evidence_count or 0
    if not count:
        return base
    noun = 'item' if count == 1 else 'items'
    return f'{base} · {count} evidence {noun}'


def allowed_actions(case):
    actions = list(TRANSITIONS.get(case.state, {}))
    if case.state != InvestigationCase.State.CLOSED:
        actions.append('assign')
    return actions


def normalize_priority(priority):
    if priority in InvestigationCase.Priority.values:
        return priority
    lookup = {value.lower(): value for value in InvestigationCase.Priority.values}
    lookup['medium'] = InvestigationCase.Priority.NORMAL
    return lookup.get(str(priority or '').strip().lower(), InvestigationCase.Priority.NORMAL)


def next_case_number():
    year = timezone.now().year
    prefix = f'INV-{year}-'
    latest = (
        InvestigationCase.objects.filter(case_number__startswith=prefix)
        .order_by('-case_number')
        .values_list('case_number', flat=True)
        .first()
    )
    seq = 1
    if latest:
        try:
            seq = int(latest.rsplit('-', 1)[-1]) + 1
        except ValueError:
            seq = InvestigationCase.objects.filter(case_number__startswith=prefix).count() + 1
    return f'{prefix}{seq:04d}'


def _record(case, action, actor_name, from_state='', to_state='', note=''):
    CaseEvent.objects.create(
        case=case,
        action=action,
        from_state=from_state,
        to_state=to_state or case.state,
        actor_name=actor_name,
        note=note,
    )


def create_case(*, title, summary='', priority=None, user=None, claim=None, evidence_count=0, state=None, assign=True, case_number='', source_key=None, notes=''):
    priority = normalize_priority(priority)
    if state not in InvestigationCase.State.values:
        state = InvestigationCase.State.NEW
    assignee = user if assign and user and getattr(user, 'is_authenticated', False) else None
    name = operator_name(assignee) if assignee else ''
    case = InvestigationCase.objects.create(
        case_number=case_number or next_case_number(),
        title=title.strip()[:240],
        summary=(summary or '')[:400],
        state=state,
        priority=priority,
        assignee=assignee,
        assignee_name=name,
        claim=claim,
        evidence_count=max(0, int(evidence_count or 0)),
        notes=notes or '',
        source_key=source_key,
    )
    _record(case, 'opened', name or 'System', to_state=case.state, note='Investigation opened')
    return case


def apply_transition(case, action, user, note=''):
    actor = operator_name(user) or 'Operator'
    if action == 'assign':
        if case.state == InvestigationCase.State.CLOSED:
            raise TransitionError('Closed cases cannot be assigned. Reopen the case first.')
        case.assignee = user if user and getattr(user, 'is_authenticated', False) else None
        case.assignee_name = actor
        case.save(update_fields=['assignee', 'assignee_name', 'updated_at'])
        _record(case, 'assign', actor, from_state=case.state, to_state=case.state, note=note or f'Assigned to {actor}')
        return case

    mapping = TRANSITIONS.get(case.state, {})
    if action not in mapping:
        raise TransitionError('That transition is not available from the current state.')
    previous = case.state
    case.state = mapping[action]
    update_fields = ['state', 'updated_at']
    if case.state == InvestigationCase.State.CLOSED:
        case.source_key = None
        update_fields.append('source_key')
    case.save(update_fields=update_fields)
    _record(case, action, actor, from_state=previous, to_state=case.state, note=note)
    return case


def update_case(case, data, user):
    actor = operator_name(user) or 'Operator'
    changed = []
    if 'title' in data:
        title = (data.get('title') or '').strip()
        if not title:
            raise ValueError('Title is required.')
        case.title = title[:240]
        changed.append('title')
    if 'summary' in data:
        case.summary = (data.get('summary') or '')[:400]
        changed.append('summary')
    if 'notes' in data:
        case.notes = data.get('notes') or ''
        changed.append('notes')
    if 'priority' in data:
        priority = data.get('priority')
        if priority not in InvestigationCase.Priority.values:
            raise ValueError('Priority is not recognized.')
        case.priority = priority
        changed.append('priority')
    if 'evidence_count' in data:
        try:
            case.evidence_count = max(0, min(999, int(data.get('evidence_count') or 0)))
        except (TypeError, ValueError):
            raise ValueError('Evidence count must be a number.')
        changed.append('evidence_count')
    if not changed:
        return case
    case.save(update_fields=[*changed, 'updated_at'])
    action = 'notes' if changed == ['notes'] else 'edited'
    _record(case, action, actor, from_state=case.state, to_state=case.state)
    return case


def _priority_from_claim(priority):
    return normalize_priority(priority)


def _title_key(title):
    cleaned = title.strip().lower()
    digest = hashlib.sha1(cleaned.encode('utf-8')).hexdigest()[:12]
    slug = slugify(title)[:40]
    return f'title:{slug or "t"}-{digest}'


@transaction.atomic
def open_case(*, user, claim_id='', title='', summary='', priority=''):
    claim = None
    evidence_count = 0
    if claim_id:
        claim = Claim.objects.filter(claim_id=claim_id).first()
        if not claim:
            raise ClaimNotFound()
        source_key = f'claim:{claim.claim_id}'
        title = claim.text[:240]
        summary = summary or f'{claim.cluster or "Unclustered"} · {claim.source}'
        priority = _priority_from_claim(claim.priority)
        evidence_count = claim.match_count
    else:
        title = (title or '').strip()
        if not title:
            raise ValueError('Title is required.')
        source_key = _title_key(title)
        priority = normalize_priority(priority)

    existing = (
        InvestigationCase.objects.select_for_update()
        .filter(source_key=source_key)
        .first()
    )
    if existing:
        return existing, False
    try:
        case = create_case(
            title=title,
            summary=summary,
            priority=priority,
            user=user,
            claim=claim,
            evidence_count=evidence_count,
            assign=True,
            source_key=source_key,
        )
    except IntegrityError:
        existing = InvestigationCase.objects.get(source_key=source_key)
        return existing, False
    return case, True


def filtered_cases(params, user):
    qs = InvestigationCase.objects.select_related('assignee', 'claim')
    query = (params.get('q') or '').strip()
    bucket = (params.get('bucket') or '').strip()
    state = (params.get('state') or '').strip()
    if query:
        qs = qs.filter(
            Q(case_number__icontains=query)
            | Q(title__icontains=query)
            | Q(summary__icontains=query)
            | Q(assignee_name__icontains=query)
            | Q(claim__claim_id__icontains=query)
        )
    if bucket == 'mine':
        name = operator_name(user)
        qs = qs.filter(Q(assignee=user) | Q(assignee_name__iexact=name))
    elif bucket == 'critical':
        qs = qs.filter(priority=InvestigationCase.Priority.CRITICAL)
    elif bucket == 'review':
        qs = qs.filter(state=InvestigationCase.State.ANALYST_REVIEW)
    if state and state in InvestigationCase.State.values:
        qs = qs.filter(state=state)
    return qs


def overview_counts(user):
    qs = InvestigationCase.objects.all()
    name = operator_name(user)
    return {
        'total': qs.count(),
        'open': qs.exclude(state__in=[
            InvestigationCase.State.PUBLISHED,
            InvestigationCase.State.CLOSED,
        ]).count(),
        'mine': qs.filter(Q(assignee=user) | Q(assignee_name__iexact=name)).count() if name else qs.filter(assignee=user).count(),
        'critical': qs.filter(priority=InvestigationCase.Priority.CRITICAL).count(),
        'awaiting_review': qs.filter(state=InvestigationCase.State.ANALYST_REVIEW).count(),
        'new_triaged': qs.filter(state__in=[
            InvestigationCase.State.NEW,
            InvestigationCase.State.TRIAGED,
        ]).count(),
        'in_analysis': qs.filter(state=InvestigationCase.State.IN_ANALYSIS).count(),
        'supervisor': qs.filter(state=InvestigationCase.State.SUPERVISOR_REVIEW).count(),
        'approved_published': qs.filter(state__in=[
            InvestigationCase.State.APPROVED,
            InvestigationCase.State.PUBLISHED,
        ]).count(),
        'needs_reopened': qs.filter(state__in=[
            InvestigationCase.State.NEEDS_MORE_EVIDENCE,
            InvestigationCase.State.REOPENED,
        ]).count(),
    }


def stamp_updated(case, minutes_ago):
    InvestigationCase.objects.filter(pk=case.pk).update(updated_at=timezone.now() - timedelta(minutes=minutes_ago))
