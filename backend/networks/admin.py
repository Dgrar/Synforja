from django.contrib import admin

from .models import Network, Run


@admin.register(Network)
class NetworkAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "user", "state", "created_at")
    list_filter = ("state",)
    search_fields = ("name",)


@admin.register(Run)
class RunAdmin(admin.ModelAdmin):
    list_display = ("id", "network", "dataset_id", "mse_loss", "accuracy", "created_at")
