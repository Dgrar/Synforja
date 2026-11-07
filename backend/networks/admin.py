from django.contrib import admin

from .models import Network


@admin.register(Network)
class NetworkAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "user", "state", "created_at")
    list_filter = ("state",)
    search_fields = ("name",)
