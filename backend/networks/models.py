from django.db import models
from django.conf import settings


class Network(models.Model):
    class State(models.TextChoices):
        DRAFT = "draft"
        TRAINING = "training"
        TRAINED = "trained"

    class Loss(models.TextChoices):
        MSE = "mse"
        BCE = "bce"
        MAE = "mae"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="networks",
    )
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=8, default="MLP", editable=False)
    state = models.CharField(max_length=10, choices=State.choices, default=State.DRAFT)
    layers = models.JSONField()
    epochs = models.PositiveIntegerField()
    learning_rate = models.FloatField()
    loss = models.CharField(max_length=8, choices=Loss.choices)
    training_split = models.FloatField()
    seed = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
