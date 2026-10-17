from rest_framework import serializers

from .models import Content, Country, FacebookPage, FetchJob, Keyword, Publisher


class CountrySerializer(serializers.ModelSerializer):
    news_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Country
        fields = ('id', 'name', 'flag', 'code', 'news_count')

    def validate(self, attrs):
        code = (attrs.get('code') or '').strip().upper()
        if code:
            attrs['code'] = code
        if code and not attrs.get('flag') and len(code) == 2 and code.isalpha():
            attrs['flag'] = ''.join(chr(0x1F1E6 + ord(char) - 65) for char in code)
        return attrs


class PublisherSerializer(serializers.ModelSerializer):
    country_name = serializers.CharField(source='country.name', read_only=True)

    class Meta:
        model = Publisher
        fields = (
            'id', 'name', 'country', 'country_name', 'url', 'search_url',
            'title_element', 'link_element', 'content_element', 'date_element', 'is_active',
        )


class KeywordSerializer(serializers.ModelSerializer):
    class Meta:
        model = Keyword
        fields = ('id', 'term', 'is_active', 'created_at')


class FacebookPageSerializer(serializers.ModelSerializer):
    page_url = serializers.CharField(read_only=True)
    country_name = serializers.CharField(source='country.name', read_only=True)

    class Meta:
        model = FacebookPage
        fields = ('id', 'name', 'page_id', 'category', 'country', 'country_name', 'is_active', 'page_url', 'created_at')


class ContentSerializer(serializers.ModelSerializer):
    country_name = serializers.CharField(source='country.name', read_only=True)
    country_code = serializers.CharField(source='country.code', read_only=True)
    country_flag = serializers.CharField(source='country.flag', read_only=True)
    publisher_name = serializers.CharField(source='publisher.name', read_only=True)

    class Meta:
        model = Content
        fields = (
            'id', 'title', 'body', 'url', 'publication_date', 'summary', 'sentiment',
            'category', 'matched_keyword', 'source_kind', 'country', 'country_name',
            'country_code', 'country_flag', 'publisher', 'publisher_name', 'created_at',
        )


class FetchJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = FetchJob
        fields = (
            'id', 'keywords', 'categories', 'start_date', 'end_date', 'publisher_ids',
            'include_newsnow', 'include_google', 'status', 'articles_found', 'articles_saved',
            'error_message', 'log', 'created_at', 'started_at', 'finished_at',
        )
