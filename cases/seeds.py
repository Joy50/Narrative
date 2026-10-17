from datetime import timedelta

from django.utils import timezone

from authentication.models import OperatorProfile
from rumor.models import Claim

from .models import CaseEvent, InvestigationCase

# case_number, title, summary, evidence, state, assignee, priority, age_minutes, claim_id
ROWS = [
    ('INV-2025-0421', 'Manipulated video: election rally', 'Recycled footage', 3, 'ANALYST_REVIEW', 'A. Rahman', 'Critical', 12, ''),
    ('INV-2025-0419', 'Audio deepfake: emergency warning', 'Synthetic speech', 2, 'SUPERVISOR_REVIEW', 'S. Karim', 'Critical', 48, 'CL-2025-8817'),
    ('INV-2025-0417', 'Recycled flood imagery (2022)', 'Out-of-context media', 5, 'IN_ANALYSIS', 'M. Hossain', 'High', 60, 'CL-2025-8836'),
    ('INV-2025-0415', 'Misleading caption: authentic protest', 'False attribution', 4, 'TRIAGED', 'N. Ferdous', 'Normal', 120, 'CL-2025-8829'),
    ('INV-2025-0410', 'Coordinated amplification: health rumor', 'Anomalous pattern', 8, 'APPROVED', 'A. Rahman', 'High', 300, ''),
    ('INV-2025-0408', 'Synthetic image: infrastructure damage', 'Synthetic media', 2, 'NEEDS_MORE_EVIDENCE', 'N. Ferdous', 'Normal', 480, ''),
    ('INV-2025-0402', 'Cross-platform narrative: election fraud claims', 'Multiple claims', 12, 'PUBLISHED', 'M. Hossain', 'High', 1440, ''),
    ('INV-2025-0398', 'Forwarded cyclone warning without bulletin', 'Unverified weather alert', 3, 'IN_ANALYSIS', 'A. Rahman', 'High', 1800, 'CL-2025-8794'),
    ('INV-2025-0396', 'Inflation figure circulating without citation', 'Statistical claim', 1, 'IN_ANALYSIS', 'S. Karim', 'Normal', 2000, 'CL-2025-8801'),
    ('INV-2025-0394', 'Recycled rally clip labeled as today', 'Out-of-context video', 4, 'TRIAGED', 'A. Rahman', 'Normal', 2200, ''),
    ('INV-2025-0392', 'Bridge closure photo from 2019 archive', 'Recycled still', 2, 'IN_ANALYSIS', 'N. Ferdous', 'High', 2400, ''),
    ('INV-2025-0391', 'Unverified nationwide shutdown notice', 'Official-looking notice', 6, 'NEW', 'A. Rahman', 'Critical', 2600, 'CL-2025-8842'),
    ('INV-2025-0388', 'Health rumor cluster across public groups', 'Repeated wording', 7, 'ANALYST_REVIEW', 'A. Rahman', 'High', 3000, ''),
    ('INV-2025-0386', 'Caption mismatch on protest photograph', 'False attribution', 3, 'ANALYST_REVIEW', 'S. Karim', 'Normal', 3200, ''),
    ('INV-2025-0384', 'Synthetic portrait shared as field photo', 'Synthetic media', 2, 'ANALYST_REVIEW', 'M. Hossain', 'High', 3400, ''),
    ('INV-2025-0382', 'Emergency audio submitted for supervisor sign-off', 'Synthetic speech', 2, 'SUPERVISOR_REVIEW', 'A. Rahman', 'Normal', 3600, ''),
    ('INV-2025-0380', 'Infrastructure damage still awaiting sign-off', 'Image claim', 1, 'SUPERVISOR_REVIEW', 'S. Karim', 'High', 3800, ''),
    ('INV-2025-0376', 'Old flood frame presented as current', 'Out-of-context media', 5, 'IN_ANALYSIS', 'N. Ferdous', 'Normal', 4000, ''),
    ('INV-2025-0372', 'Election graphic with altered timestamp', 'Manipulated graphic', 2, 'TRIAGED', 'M. Hossain', 'High', 4200, ''),
    ('INV-2025-0370', 'Public post repeating a closed rumor', 'Repeat circulation', 3, 'TRIAGED', 'S. Karim', 'Normal', 4400, ''),
    ('INV-2025-0368', 'Low-urgency satire clip mislabeled as news', 'Satire / parody', 1, 'NEW', 'N. Ferdous', 'Low', 4600, ''),
    ('INV-2025-0360', 'Approved finding: recycled construction photo', 'Archive match', 4, 'APPROVED', 'M. Hossain', 'Normal', 5200, ''),
    ('INV-2025-0355', 'Published finding: cited inflation release', 'Corroborated statistic', 2, 'PUBLISHED', 'S. Karim', 'High', 6000, ''),
    ('INV-2025-0350', 'Reopened: new copy of evacuation audio', 'Follow-up lead', 3, 'REOPENED', 'N. Ferdous', 'High', 7000, ''),
]


def _assignee(name):
    profile = OperatorProfile.objects.filter(display_name=name).select_related('user').first()
    if profile:
        return profile.user, profile.display_name
    return None, name


def seed_cases():
    created = 0
    updated = 0
    for number, title, summary, evidence, state, assignee, priority, age, claim_id in ROWS:
        user, name = _assignee(assignee)
        claim = Claim.objects.filter(claim_id=claim_id).first() if claim_id else None
        source_key = f'claim:{claim.claim_id}' if claim else None
        if source_key and InvestigationCase.objects.filter(source_key=source_key).exclude(case_number=number).exists():
            source_key = None
        case, was_created = InvestigationCase.objects.update_or_create(
            case_number=number,
            defaults={
                'title': title,
                'summary': summary,
                'evidence_count': evidence,
                'state': state,
                'assignee': user,
                'assignee_name': name,
                'priority': priority,
                'claim': claim,
                'source_key': source_key,
            },
        )
        InvestigationCase.objects.filter(pk=case.pk).update(updated_at=timezone.now() - timedelta(minutes=age))
        if not case.events.exists():
            event = CaseEvent.objects.create(
                case=case,
                action='opened',
                to_state=state,
                actor_name=name,
                note='Seeded investigation',
            )
            CaseEvent.objects.filter(pk=event.pk).update(
                created_at=timezone.now() - timedelta(minutes=age + 30),
            )
        if was_created:
            created += 1
        else:
            updated += 1
    return {'created': created, 'updated': updated, 'total': InvestigationCase.objects.count()}
