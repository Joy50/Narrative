from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


def paginate(queryset, request, serializer_class=None, serializer_fn=None):
    paginator = StandardPagination()
    page = paginator.paginate_queryset(queryset, request)
    if serializer_fn:
        data = serializer_fn(page)
    else:
        data = serializer_class(page, many=True).data
    return paginator.get_paginated_response(data)
