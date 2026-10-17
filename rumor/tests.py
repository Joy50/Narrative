from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from .models import AlertState, Claim, ValidatedClaim
from .services import assign_alert, build_alert_analysis


class AlertAnalysisTests(TestCase):
    def setUp(self):
        now = timezone.now()
        Claim.objects.create(
            claim_id='CL-TEST-ECHO',
            text='A notice claims the internet will shut down nationwide tomorrow morning.',
            language='English',
            source='Public page',
            cluster='internet-shutdown',
            first_seen=now - timedelta(hours=4),
            match_count=40,
            priority=Claim.Priority.HIGH,
            status=Claim.Status.UNVERIFIED,
        )
        Claim.objects.create(
            claim_id='CL-TEST-DIVERGE',
            text='A forwarded post says Cox’s Bazar must evacuate tonight because a cyclone warning was secretly cancelled.',
            language='English',
            source='Public Telegram channel',
            url='t.me/publicchannel/4412',
            cluster='cyclone-warning',
            first_seen=now - timedelta(hours=2),
            match_count=30,
            priority=Claim.Priority.HIGH,
            status=Claim.Status.UNVERIFIED,
        )
        Claim.objects.create(
            claim_id='CL-TEST-SYNTH',
            text='Forwarded audio claims a cabinet curfew order was issued this week.',
            language='English',
            source='Forwarded audio',
            cluster='cabinet-audio',
            first_seen=now - timedelta(hours=8),
            match_count=12,
            priority=Claim.Priority.CRITICAL,
            status=Claim.Status.SYNTHETIC,
        )
        Claim.objects.create(
            claim_id='CL-TEST-OK',
            text='Inflation figure matches the published statistics release.',
            language='English',
            source='News site',
            cluster='inflation',
            first_seen=now - timedelta(hours=20),
            match_count=4,
            priority=Claim.Priority.LOW,
            status=Claim.Status.SUPPORTED,
        )
        ValidatedClaim.objects.create(
            claim_id='CL-TEST-BMD',
            text='BMD issued a cyclone warning for coastal Cox’s Bazar and advised fishing vessels to return to harbor.',
            topic='cyclone-warning',
            authority='Bangladesh Meteorological Department',
            verified_at=now.date(),
        )

    def test_rules_score_open_claims_and_skip_supported(self):
        payload = build_alert_analysis(operator='A. Rahman')
        by_id = {row['id']: row for row in payload['alerts']}

        self.assertEqual(by_id['CL-TEST-ECHO']['rule_id'], 'ALERT-ECHO')
        self.assertEqual(by_id['CL-TEST-DIVERGE']['rule_id'], 'VALIDATED-DIVERGE')
        self.assertTrue(by_id['CL-TEST-DIVERGE']['validated']['diverges'])
        self.assertEqual(by_id['CL-TEST-SYNTH']['rule_id'], 'SYNTHETIC-SIG')
        self.assertEqual(by_id['CL-TEST-SYNTH']['sev'], 'critical')
        self.assertNotIn('CL-TEST-OK', by_id)
        self.assertGreaterEqual(payload['overview']['suppressed'], 1)
        self.assertEqual(payload['overview']['unassigned'], 3)
        for row in payload['alerts']:
            self.assertEqual(len(row['factors']), 3)
            self.assertTrue(row['recommendation'])
            self.assertGreater(row['score'], 0)

    def test_assignment_marks_mine(self):
        assign_alert('CL-TEST-ECHO', 'A. Rahman')
        payload = build_alert_analysis('CL-TEST-ECHO', operator='A. Rahman')
        self.assertEqual(payload['selected']['assignee'], 'A. Rahman')
        self.assertTrue(payload['selected']['mine'])
        self.assertEqual(payload['overview']['mine'], 1)
        self.assertEqual(AlertState.objects.get(alert_key='CL-TEST-ECHO').assignee, 'A. Rahman')
