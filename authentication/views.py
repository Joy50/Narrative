from django.conf import settings
from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import LoginSerializer, OperatorSerializer


def tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }


def operator_payload(user):
    profile = getattr(user, 'profile', None)
    if profile:
        return OperatorSerializer(profile).data
    return {
        'operator_id': user.get_username(),
        'name': user.get_full_name() or user.get_username(),
        'initials': (user.get_username()[:2] or 'OP').upper(),
        'role': 'Operator',
        'clearance': 'RESTRICTED',
        'unit': 'Narrative Control Directorate',
    }


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        operator_id = serializer.validated_data['operator_id'].strip().lower()
        passphrase = serializer.validated_data['passphrase']
        clearance_token = serializer.validated_data['clearance_token'].strip()

        user = authenticate(request, username=operator_id, password=passphrase)
        if user is None or not user.is_active:
            return Response(
                {'detail': 'Invalid operator credentials or clearance token.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        profile = getattr(user, 'profile', None)
        expected = (profile.clearance_token if profile else '') or settings.ORGANIZATION_CLEARANCE_TOKEN
        if clearance_token.upper() != expected.upper():
            return Response(
                {'detail': 'Clearance token rejected by access broker.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response({
            **tokens_for_user(user),
            'user': operator_payload(user),
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = request.data.get('refresh')
        if refresh:
            try:
                token = RefreshToken(refresh)
                token.blacklist()
            except TokenError:
                pass
        return Response({'detail': 'Session ended.'})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(operator_payload(request.user))
