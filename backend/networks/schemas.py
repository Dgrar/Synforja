from typing import Literal, Optional

from ninja import Schema
from pydantic import Field, field_validator

Activation = Literal["relu", "sigmoid", "tanh", "softmax", "linear"]
Loss = Literal["mse", "bce", "mae"]

SEED_MAX = (1 << 63) - 1

MAX_LAYERS = 20
MAX_LAYER_NEURONS = 2048


class LayerIn(Schema):
    size: int = Field(ge=1, le=MAX_LAYER_NEURONS)
    activation: Activation

    @field_validator("activation", mode="before")
    @classmethod
    def normalize_activation(cls, value):
        if isinstance(value, str):
            return value.lower()
        return value


class NetworkIn(Schema):
    name: str = Field(max_length=100)
    layers: list[LayerIn] = Field(min_length=2, max_length=MAX_LAYERS)
    epochs: int = Field(ge=1)
    learning_rate: float = Field(gt=0)
    loss: Loss
    training_split: float = Field(gt=0, lt=1)
    seed: Optional[int] = Field(default=None, ge=0, le=SEED_MAX)


class NetworkOut(Schema):
    id: int
    name: str
    type: str
    state: str
    layers: list[LayerIn]
    epochs: int
    learning_rate: float
    loss: str
    training_split: float
    seed: int


class NetworkPatchIn(Schema):
    name: Optional[str] = Field(default=None, max_length=100)
    layers: Optional[list[LayerIn]] = None
    epochs: Optional[int] = Field(default=None, ge=1)
    learning_rate: Optional[float] = Field(default=None, gt=0)
    loss: Optional[Loss] = None
    training_split: Optional[float] = Field(default=None, gt=0, lt=1)
    seed: Optional[int] = Field(default=None, ge=0, le=SEED_MAX)
