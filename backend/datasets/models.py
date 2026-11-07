from django.db import models
from django.conf import settings


class Dataset(models.Model):
    class SourceType(models.TextChoices):
        CSV = "csv"
        JSON = "json"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="datasets",
    )
    name = models.CharField(max_length=100)
    source_type = models.CharField(max_length=8, choices=SourceType.choices)
    content = models.TextField()
    total_rows = models.PositiveIntegerField()
    input_cols = models.PositiveIntegerField()
    output_cols = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
