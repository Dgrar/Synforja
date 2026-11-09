import json

DUMP_BYTES_PER_FLOAT = 19
MAX_DUMP_BYTES = 50 * 1024 * 1024

LOSS_NAMES = {"mse": "mse_loss", "bce": "bce_loss", "mae": "mae_loss"}

# Tipos de errores posibles
ENGINE_CLIENT_ERRORS = {
    "config",
    "shape",
    "empty_split",
    "divergence",
    "softmax",
    "dataset",
}

# Para construir el json del modelo
def build_model_config(network) -> str:
    return json.dumps(
        {
            "layers": [dict(layer) for layer in network.layers],
            "loss_fn": LOSS_NAMES[network.loss],
            "lr": network.learning_rate,
            "epochs": network.epochs,
            "training_split": network.training_split,
            "seed": network.seed,
        }
    )

# Estima el total de bytes de tamaño del nn.
def estimate_dump_bytes(layers) -> int:
    total = 0
    for current, next_layer in zip(layers, layers[1:]):
        total += (
            (current["size"] * next_layer["size"] + next_layer["size"])
            * DUMP_BYTES_PER_FLOAT
        )
    return total

# Para parsear los errores del engine
def parse_engine_error(message: str) -> tuple[str, str]:
    prefix = "engine::"
    if message.startswith(prefix):
        code, _, detail = message[len(prefix) :].partition(": ")
        return code, detail or message
    return "unexpected", message


def engine_error_status(code: str) -> int:
    return 422 if code in ENGINE_CLIENT_ERRORS else 500
