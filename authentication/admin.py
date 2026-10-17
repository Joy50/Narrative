from django.contrib import admin

from .models import OperatorProfile


@admin.register(OperatorProfile)
class OperatorProfileAdmin(admin.ModelAdmin):
    list_display = ('display_name', 'user', 'role', 'clearance', 'unit')
    search_fields = ('display_name', 'user__username', 'role', 'unit')
