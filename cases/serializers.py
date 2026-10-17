from rest_framework import serializers

from .models import CaseEvent, InvestigationCase
from .services import (
    ACTION_LABELS,
    PRIORITY_CLASS,
    STATE_META,
    allowed_actions,
    avatar_class,
    relative_time,
    summary_label,
)


class CaseEventSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    when = serializers.SerializerMethodField()

    class Meta:
        model = CaseEvent
        fields = ('id', 'action', 'label', 'from_state', 'to_state', 'actor_name', 'note', 'created_at', 'when')

    def get_label(self, obj):
        return ACTION_LABELS.get(obj.action, obj.action.replace('_', ' ').title())

    def get_when(self, obj):
        return relative_time(obj.created_at)


class CaseSerializer(serializers.ModelSerializer):
    state_label = serializers.SerializerMethodField()
    state_class = serializers.SerializerMethodField()
    priority_class = serializers.SerializerMethodField()
    summary_label = serializers.SerializerMethodField()
    avatar_class = serializers.SerializerMethodField()
    updated_label = serializers.SerializerMethodField()
    claim_id = serializers.SerializerMethodField()
    allowed_actions = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()

    class Meta:
        model = InvestigationCase
        fields = (
            'id', 'case_number', 'title', 'summary', 'summary_label', 'state', 'state_label',
            'state_class', 'priority', 'priority_class', 'assignee_name', 'avatar_class',
            'evidence_count', 'notes', 'claim_id', 'updated_at', 'updated_label', 'created_at',
            'allowed_actions', 'events',
        )

    def get_state_label(self, obj):
        return STATE_META.get(obj.state, (obj.state, 's-new'))[0]

    def get_state_class(self, obj):
        return STATE_META.get(obj.state, (obj.state, 's-new'))[1]

    def get_priority_class(self, obj):
        return PRIORITY_CLASS.get(obj.priority, 'prio-normal')

    def get_summary_label(self, obj):
        return summary_label(obj)

    def get_avatar_class(self, obj):
        return avatar_class(obj.assignee_name)

    def get_updated_label(self, obj):
        return relative_time(obj.updated_at)

    def get_claim_id(self, obj):
        if obj.claim_id and getattr(obj, 'claim', None):
            return obj.claim.claim_id
        return ''

    def get_allowed_actions(self, obj):
        return allowed_actions(obj)

    def get_events(self, obj):
        if not self.context.get('include_events'):
            return []
        return CaseEventSerializer(obj.events.all(), many=True).data
