from django.contrib import admin

from .models import AlertState, Assessment, Claim, NarrativeCluster, SourceFeed, ValidatedClaim

admin.site.register(Claim)
admin.site.register(ValidatedClaim)
admin.site.register(SourceFeed)
admin.site.register(NarrativeCluster)
admin.site.register(Assessment)
admin.site.register(AlertState)
