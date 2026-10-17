import uuid
from pathlib import Path

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .evidence import digest, media_kind
from .models import Claim, Evidence, EvidenceEvent
from .services import detect_language, triage_priority
from .workflow import record_case


def ingest_media(request):
    file = request.FILES['file']
    name = Path(file.name.replace('\\', '/')).name[:255]
    kind = media_kind(name)
    if not kind:
        raise ValidationError({'file': 'Upload an image, audio, or video file with a recognized extension.'})
    if not 0 < file.size <= 500 * 1024 * 1024:
        raise ValidationError({'file': 'Choose a non-empty file up to 500 MB.'})
    text = (request.data.get('description') or request.data.get('text') or f'{kind.title()} submission: {name}').strip()
    priority = request.data.get('priority')
    if priority not in Claim.Priority.values:
        priority = triage_priority(text)
    checksum = digest(file)
    file.seek(0)
    obj = None
    try:
        with transaction.atomic():
            claim = Claim.objects.create(
                claim_id='CL-' + uuid.uuid4().hex[:16].upper(), text=text,
                language=detect_language(text), source=(request.data.get('source') or f'{kind.title()} intake')[:255],
                url=(request.data.get('source_url') or '')[:500], first_seen=timezone.now(),
                intake_kind='media', media_type=kind, priority=priority, notes=request.data.get('notes') or '',
            )
            case = record_case(claim, request.user, 'media_intake', f'{kind.title()} original submitted into Rumor Scanner.')
            file.name = uuid.uuid4().hex
            obj = Evidence.objects.create(file=file, name=name, size=file.size, sha256=checksum, claim=claim,
                                          media_type=kind, case_reference=case.case_number,
                                          source_url=request.data.get('source_url') or '', notes=claim.notes,
                                          uploaded_by=request.user, verified_at=timezone.now())
            EvidenceEvent.objects.create(evidence=obj, action='Collected', actor=request.user.get_username(), detail=f'Original linked to {claim.claim_id} and {case.case_number}.')
            case.evidence_count = Evidence.objects.filter(case_reference=case.case_number).count()
            case.save(update_fields=['evidence_count', 'updated_at'])
    except Exception:
        if obj and obj.file:
            obj.file.delete(save=False)
        raise
    from .views import serialize_claim
    return Response({'created': [serialize_claim(claim)], 'duplicates': [], 'created_count': 1, 'duplicate_count': 0}, status=201)
