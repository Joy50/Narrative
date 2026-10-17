from django.contrib import admin

from .models import CaseEvent, InvestigationCase

admin.site.register(InvestigationCase)
admin.site.register(CaseEvent)
