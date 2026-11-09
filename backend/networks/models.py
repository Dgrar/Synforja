from django.db import models
from django.conf import settings


class Network(models.Model):
    # Si esta construyendose, entrenandose o ya ha sido entrenada
    class State(models.TextChoices):
        DRAFT = "draft"
        TRAINING = "training"
        TRAINED = "trained"

    # Las funciones de pérdida que puede llegar a usar
    class Loss(models.TextChoices):
        MSE = "mse"
        BCE = "bce"
        MAE = "mae"

    # El usuario dueño
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="networks",
    )
    # Nombre de la nn
    name = models.CharField(max_length=100)
    # Configs de la nn
    type = models.CharField(max_length=8, default="MLP", editable=False)
    state = models.CharField(max_length=10, choices=State.choices, default=State.DRAFT)
    layers = models.JSONField()
    # Hiperparámetros
    epochs = models.PositiveIntegerField()
    learning_rate = models.FloatField()
    loss = models.CharField(max_length=8, choices=Loss.choices)
    training_split = models.FloatField()
    # Seed
    seed = models.PositiveBigIntegerField()
    # Datos post entreno
    weights = models.JSONField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Run(models.Model):
    # El modelo
    network = models.ForeignKey(Network, on_delete=models.CASCADE, related_name="runs")
    dataset_id = models.PositiveBigIntegerField()
    # Dimensiones del modelo
    total_rows = models.PositiveIntegerField()
    input_cols = models.PositiveIntegerField()
    output_cols = models.PositiveIntegerField()
    # Métricas de entrenamiento
    mse_loss = models.FloatField()
    r_square = models.FloatField()
    accuracy = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
