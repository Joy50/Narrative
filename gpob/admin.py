from django.contrib import admin

from .models import Content, Country, FacebookPage, FetchJob, Keyword, Publisher

admin.site.register(Country)
admin.site.register(Publisher)
admin.site.register(Keyword)
admin.site.register(Content)
admin.site.register(FacebookPage)
admin.site.register(FetchJob)
