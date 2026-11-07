from django.contrib import admin

from .models import Dataset


@admin.register(Dataset)
class DatasetAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "user", "source_type", "total_rows", "created_at")
    list_filter = ("source_type",)
    search_fields = ("name",)
