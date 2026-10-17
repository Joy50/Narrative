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
    clearance_token = serializers.CharField()

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'operator_id' not in data and data.get('operatorId'):
            data['operator_id'] = data['operatorId']
        if 'clearance_token' not in data and (data.get('token') or data.get('clearanceToken')):
            data['clearance_token'] = data.get('token') or data.get('clearanceToken')
        return super().to_internal_value(data)
