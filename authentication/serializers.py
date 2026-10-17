from rest_framework import serializers

from .models import OperatorProfile


class OperatorSerializer(serializers.ModelSerializer):
    operator_id = serializers.CharField(source='user.username', read_only=True)
    name = serializers.CharField(source='display_name', read_only=True)

    class Meta:
        model = OperatorProfile
        fields = ('operator_id', 'name', 'initials', 'role', 'clearance', 'unit')


class LoginSerializer(serializers.Serializer):
    operator_id = serializers.CharField()
    passphrase = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'operator_id' not in data and data.get('operatorId'):
            data['operator_id'] = data['operatorId']
        return super().to_internal_value(data)
