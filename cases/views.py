from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config.pagination import paginate

from .models import InvestigationCase
from .serializers import CaseSerializer
from .services import (
    ClaimNotFound,
    TransitionError,
    apply_transition,
    create_case,
    filtered_cases,
    open_case,
    overview_counts,
    update_case,
)


def serialize_case(case, include_events=False):
    case = (
        InvestigationCase.objects.select_related('assignee', 'claim')
        .prefetch_related('events')
        .get(pk=case.pk)
    )
    return CaseSerializer(case, context={'include_events': include_events}).data


def serialize_list(cases):
    return CaseSerializer(cases, many=True).data


class OverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(overview_counts(request.user))


class CaseListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return paginate(filtered_cases(request.query_params, request.user), request, serializer_fn=serialize_list)

    def post(self, request):
        title = (request.data.get('title') or '').strip()
        if not title:
            return Response({'detail': 'Title is required.'}, status=status.HTTP_400_BAD_REQUEST)
        assign = request.data.get('assign_me', True)
        if assign in (False, 'false', '0', 0):
            assign = False
        try:
            case = create_case(
                title=title,
                summary=request.data.get('summary') or '',
                priority=request.data.get('priority'),
                user=request.user,
                evidence_count=request.data.get('evidence_count') or 0,
                assign=bool(assign),
                notes=request.data.get('notes') or '',
            )
        except (TypeError, ValueError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serialize_case(case, include_events=True), status=status.HTTP_201_CREATED)


class ExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = filtered_cases(request.query_params, request.user)[:500]
        return Response({'results': serialize_list(qs)})


class OpenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            case, created = open_case(
                user=request.user,
                claim_id=(request.data.get('claim_id') or '').strip(),
                title=request.data.get('title') or '',
                summary=request.data.get('summary') or '',
                priority=request.data.get('priority') or '',
            )
        except ClaimNotFound:
            return Response({'detail': 'Claim was not found.'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        payload = serialize_case(case, include_events=True)
        payload['created'] = created
        return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class CaseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        case = get_object_or_404(InvestigationCase, pk=pk)
        return Response(serialize_case(case, include_events=True))

    def patch(self, request, pk):
        case = get_object_or_404(InvestigationCase, pk=pk)
        try:
            case = update_case(case, request.data, request.user)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serialize_case(case, include_events=True))


class CaseByNumberView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, case_number):
        case = get_object_or_404(InvestigationCase, case_number=case_number)
        return Response(serialize_case(case, include_events=True))


class TransitionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        case = get_object_or_404(InvestigationCase, pk=pk)
        action = (request.data.get('action') or '').strip()
        if not action:
            return Response({'detail': 'Action is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            case = apply_transition(case, action, request.user, note=request.data.get('note') or '')
        except TransitionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serialize_case(case, include_events=True))
