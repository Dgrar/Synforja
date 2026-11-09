from django.test import SimpleTestCase

from .engine import (
    DUMP_BYTES_PER_FLOAT,
    MAX_DUMP_BYTES,
    build_model_config,
    engine_error_status,
    estimate_dump_bytes,
    parse_engine_error,
)
from .models import Network

# Para construir la nn
def make_network(**overrides) -> Network:
    values = {
        "name": "demo",
        "layers": [
            {"size": 2, "activation": "linear"},
            {"size": 4, "activation": "tanh"},
            {"size": 1, "activation": "tanh"},
        ],
        "epochs": 500,
        "learning_rate": 0.1,
        "loss": "mse",
        "training_split": 0.8,
        "seed": 42,
    }
    values.update(overrides)
    return Network(**values)

# Los tests de construcción del modelo
class BuildModelConfigTests(SimpleTestCase):
    # Tests de pérdidas
    def test_maps_all_losses(self):
        for loss, engine_name in [
            ("mse", "mse_loss"),
            ("bce", "bce_loss"),
            ("mae", "mae_loss"),
        ]:
            config = build_model_config(make_network(loss=loss))
            self.assertIn(f'"loss_fn": "{engine_name}"', config)
    # Tests de hiperparámetros
    def test_includes_topology_and_hyperparameters(self):
        config = build_model_config(make_network())

        self.assertIn('"layers": [{"size": 2, "activation": "linear"}', config)
        self.assertIn('"epochs": 500', config)
        self.assertIn('"lr": 0.1', config)
        self.assertIn('"training_split": 0.8', config)
        self.assertIn('"seed": 42', config)

# Test de estimación de bytes
class EstimateDumpBytesTests(SimpleTestCase):
    # Tests de tamaños
    def test_sums_weights_and_biases_per_layer(self):
        layers = [
            {"size": 2, "activation": "linear"},
            {"size": 4, "activation": "tanh"},
            {"size": 1, "activation": "tanh"},
        ]

        expected = ((2 * 4 + 4) + (4 * 1 + 1)) * DUMP_BYTES_PER_FLOAT

        self.assertEqual(estimate_dump_bytes(layers), expected)
    # Test tamaño crece segun la mayor cantidad de neuronas por capa
    def test_grows_with_width(self):
        narrow = [{"size": 2, "activation": "linear"}, {"size": 1, "activation": "linear"}]
        wide = [{"size": 2, "activation": "linear"}, {"size": 64, "activation": "linear"}]

        self.assertGreater(estimate_dump_bytes(wide), estimate_dump_bytes(narrow))
    # Test el backend limita el tamaño del NN
    def test_max_allowed_network_exceeds_dump_limit(self):
        layers = [{"size": 2048, "activation": "relu"} for _ in range(20)]

        self.assertGreater(estimate_dump_bytes(layers), MAX_DUMP_BYTES)

    # Testea el límite de cara
    def test_limit_is_fifty_mib(self):
        self.assertEqual(MAX_DUMP_BYTES, 50 * 1024 * 1024)

# Tests para comprobar si los errores funcionan
class ParseEngineErrorTests(SimpleTestCase):
    def test_extracts_code_and_detail(self):
        code, detail = parse_engine_error(
            "engine::empty_split: La partición quedó vacía"
        )

        self.assertEqual(code, "empty_split")
        self.assertEqual(detail, "La partición quedó vacía")

    def test_detail_keeps_colons(self):
        code, detail = parse_engine_error("engine::shape: esperado: 3, llegó: 2")

        self.assertEqual(code, "shape")
        self.assertEqual(detail, "esperado: 3, llegó: 2")

    def test_unknown_message_is_unexpected(self):
        code, detail = parse_engine_error("algo raro")

        self.assertEqual(code, "unexpected")
        self.assertEqual(detail, "algo raro")


class EngineErrorStatusTests(SimpleTestCase):
    def test_client_errors_are_422(self):
        for code in ("config", "shape", "empty_split", "divergence", "softmax", "dataset"):
            self.assertEqual(engine_error_status(code), 422)

    def test_unknown_errors_are_500(self):
        self.assertEqual(engine_error_status("unexpected"), 500)
        self.assertEqual(engine_error_status("otra_cosa"), 500)
