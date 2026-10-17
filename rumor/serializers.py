from rest_framework import serializers

from .models import Assessment, Claim, NarrativeCluster, SourceFeed, ValidatedClaim


class ValidatedClaimSerializer(serializers.ModelSerializer):
    class Meta:
        model = ValidatedClaim
        fields = (
            'id', 'claim_id', 'text', 'language', 'topic', 'authority', 'corroborators',
            'source_url', 'verdict', 'evidence', 'verified_by', 'verified_at',
            'match_count', 'is_active', 'created_at',
        )


class ClaimSerializer(serializers.ModelSerializer):
    first_seen_label = serializers.SerializerMethodField()
    validated_match = serializers.SerializerMethodField()

    class Meta:
        model = Claim
        fields = (
            'id', 'claim_id', 'text', 'language', 'source', 'url', 'cluster',
            'first_seen', 'first_seen_label', 'match_count', 'priority', 'status',
            'analyst', 'evidence', 'filters', 'review_score', 'notes', 'intake_kind',
            'validated_match', 'created_at',
            'assigned_to', 'workflow_stage', 'handling_mode', 'media_type', 'generated_report',
        )

    def get_first_seen_label(self, obj):
        return obj.first_seen.strftime('%d %b %Y %H:%M UTC')

    def get_validated_match(self, obj):
        matches = self.context.get('validated_matches') or {}
        hit = matches.get(obj.claim_id)
        if not hit:
            return None
        return ValidatedClaimSerializer(hit).data


class AssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assessment
        fields = ('id', 'claim', 'verdict', 'confidence', 'notes', 'analyst', 'stage', 'created_at')


class SourceFeedSerializer(serializers.ModelSerializer):
    class Meta:
        model = SourceFeed
        fields = ('id', 'name', 'kind', 'status', 'is_internal', 'is_active', 'sort_order')


class NarrativeClusterSerializer(serializers.ModelSerializer):
    class Meta:
        model = NarrativeCluster
        fields = ('id', 'slug', 'label', 'post_count', 'trend')
