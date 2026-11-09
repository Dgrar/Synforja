import json
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase

from ninja.errors import HttpError

from core.apitest import ApiTestBase, auth_headers, rand_suffix
from datasets.models import Dataset

from .api import (
    MAX_TRAIN_EPOCHS,
    MAX_TRAIN_LR,
    MAX_TRAIN_STEPS,
    ensure_trainable_cost,
    ensure_trainable_shape,
)
from .models import Network, Run

XOR_JSON = json.dumps(
    {
        "inputs": [[0, 0], [0, 1], [1, 0], [1, 1]] * 4,
        "expects": [[0], [1], [1], [0]] * 4,
    }
)

XOR_CSV = "0.0,0.0,0.0\n0.0,1.0,1.0\n1.0,0.0,1.0\n1.0,1.0,0.0\n" * 4

# Test de validacion del entreno
class TrainValidationTests(SimpleTestCase):
    # Para calcular el costo
    def cost(self, epochs, learning_rate, rows):
        network = SimpleNamespace(epochs=epochs, learning_rate=learning_rate)
        dataset = SimpleNamespace(total_rows=rows)
        ensure_trainable_cost(network, dataset)
    # Para testear el budget del costo
    def test_budget_exactly_at_limit_passes(self):
        self.cost(5000, 0.1, 1000)
    # Comprobamos si al subir el presupuesto del limite hay error
    def test_budget_over_limit_raises_422(self):
        with self.assertRaises(HttpError) as ctx:
            self.cost(5000, 0.1, 1001)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("presupuesto", str(ctx.exception))
    # Comprobamos que el número máximo de epochs funciona
    def test_epochs_cap(self):
        self.cost(MAX_TRAIN_EPOCHS, 0.1, 1)
        with self.assertRaises(HttpError):
            self.cost(MAX_TRAIN_EPOCHS + 1, 0.1, 1)
    # Testeamos LR
    def test_learning_rate_cap(self):
        self.cost(1, MAX_TRAIN_LR, 1)
        with self.assertRaises(HttpError):
            self.cost(1, MAX_TRAIN_LR + 0.0001, 1)
    # Testeamos que las formas sean compatibles
    def test_shape_compatibility(self):
        network = SimpleNamespace(
            layers=[{"size": 2, "activation": "linear"}, {"size": 1, "activation": "tanh"}]
        )
        dataset = SimpleNamespace(input_cols=2, output_cols=1)
        ensure_trainable_shape(network, dataset)

        bad_dataset = SimpleNamespace(input_cols=3, output_cols=1)
        with self.assertRaises(HttpError) as ctx:
            ensure_trainable_shape(network, bad_dataset)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("entradas", str(ctx.exception))

        bad_output = SimpleNamespace(input_cols=2, output_cols=2)
        with self.assertRaises(HttpError):
            ensure_trainable_shape(network, bad_output)


class TrainEndpointTests(ApiTestBase):
    def setUp(self):
        super().setUp()
        users = get_user_model()
        self.user = users.objects.create_user(
            username=f"owner_{rand_suffix()}", password="ClaveSegura123"
        )
        self.other = users.objects.create_user(
            username=f"other_{rand_suffix()}", password="ClaveSegura123"
        )
        self.auth = auth_headers(self.user)

    def make_network(self, user=None, **overrides):
        values = {
            "user": user or self.user,
            "name": "xor",
            "state": Network.State.DRAFT,
            "layers": [
                {"size": 2, "activation": "linear"},
                {"size": 4, "activation": "tanh"},
                {"size": 1, "activation": "tanh"},
            ],
            "epochs": 50,
            "learning_rate": 0.1,
            "loss": "mse",
            "training_split": 0.8,
            "seed": 42,
        }
        values.update(overrides)
        return Network.objects.create(**values)

    def make_dataset(self, user=None, content=XOR_JSON, **overrides):
        values = {
            "user": user or self.user,
            "name": "xor",
            "source_type": Dataset.SourceType.JSON,
            "content": content,
            "total_rows": 16,
            "input_cols": 2,
            "output_cols": 1,
        }
        values.update(overrides)
        return Dataset.objects.create(**values)

    def train(self, network_id, dataset_id):
        return self.post_json(
            f"/api/networks/{network_id}/train", {"dataset_id": dataset_id}
        )

    def test_train_returns_run_and_marks_trained(self):
        network = self.make_network()
        dataset = self.make_dataset()

        response = self.train(network.id, dataset.id)

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(
            set(body),
            {"id", "mse_loss", "r_square", "accuracy", "dataset"},
        )
        self.assertEqual(
            body["dataset"],
            {"id": dataset.id, "total_rows": 16, "input_cols": 2, "output_cols": 1},
        )

        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.TRAINED)
        self.assertIsNotNone(network.weights)
        self.assertIn("weights", network.weights)
        self.assertIn("topology", network.weights)

        run = Run.objects.get(network=network)
        self.assertEqual(run.dataset_id, dataset.id)
        self.assertEqual(run.mse_loss, body["mse_loss"])

    def test_retrain_accumulates_runs_with_same_metrics(self):
        network = self.make_network()
        dataset = self.make_dataset()

        first = self.train(network.id, dataset.id)
        second = self.train(network.id, dataset.id)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertNotEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(first.json()["mse_loss"], second.json()["mse_loss"])
        self.assertEqual(first.json()["accuracy"], second.json()["accuracy"])
        self.assertEqual(Run.objects.filter(network=network).count(), 2)

    def test_train_csv_dataset(self):
        network = self.make_network()
        dataset = self.make_dataset(content=XOR_CSV, source_type=Dataset.SourceType.CSV)

        response = self.train(network.id, dataset.id)

        self.assertEqual(response.status_code, 201)

    def test_train_requires_auth(self):
        network = self.make_network()
        dataset = self.make_dataset()

        self.auth = {}
        response = self.train(network.id, dataset.id)

        self.assertEqual(response.status_code, 401)

    def test_train_unknown_network_is_404(self):
        dataset = self.make_dataset()
        response = self.train(999_999, dataset.id)
        self.assertEqual(response.status_code, 404)

    def test_train_foreign_network_is_404(self):
        network = self.make_network(user=self.other)
        dataset = self.make_dataset()

        response = self.train(network.id, dataset.id)

        self.assertEqual(response.status_code, 404)

    def test_train_foreign_dataset_is_404(self):
        network = self.make_network()
        dataset = self.make_dataset(user=self.other)

        response = self.train(network.id, dataset.id)

        self.assertEqual(response.status_code, 404)

    def test_train_while_training_is_409(self):
        network = self.make_network(state=Network.State.TRAINING)
        dataset = self.make_dataset()

        response = self.train(network.id, dataset.id)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(Run.objects.count(), 0)

    def test_train_shape_mismatch_is_422_and_stays_draft(self):
        network = self.make_network(
            layers=[
                {"size": 3, "activation": "linear"},
                {"size": 1, "activation": "tanh"},
            ]
        )
        dataset = self.make_dataset()

        response = self.train(network.id, dataset.id)

        self.assertEqual(response.status_code, 422)
        self.assertIn("entradas", response.json()["detail"])
        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.DRAFT)
        self.assertIsNone(network.weights)
        self.assertEqual(Run.objects.count(), 0)

    def test_train_softmax_is_422_and_stays_draft(self):
        network = self.make_network(
            layers=[
                {"size": 2, "activation": "linear"},
                {"size": 4, "activation": "tanh"},
                {"size": 1, "activation": "softmax"},
            ]
        )
        dataset = self.make_dataset()

        response = self.train(network.id, dataset.id)

        self.assertEqual(response.status_code, 422)
        self.assertIn("SoftMax", response.json()["detail"])
        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.DRAFT)
        self.assertIsNone(network.weights)
        self.assertEqual(Run.objects.count(), 0)

    def test_train_empty_split_is_422_and_stays_draft(self):
        network = self.make_network()
        single_row = json.dumps({"inputs": [[0.0, 0.0]], "expects": [[0.0]]})
        dataset = self.make_dataset(
            content=single_row, total_rows=1
        )

        response = self.train(network.id, dataset.id)

        self.assertEqual(response.status_code, 422)
        self.assertIn("partición", response.json()["detail"])
        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.DRAFT)
        self.assertIsNone(network.weights)
        self.assertEqual(Run.objects.count(), 0)

    def test_train_divergence_is_422_and_stays_draft(self):
        network = self.make_network(
            layers=[
                {"size": 1, "activation": "linear"},
                {"size": 1, "activation": "linear"},
            ],
            learning_rate=1.0,
            epochs=100,
        )
        explosive = json.dumps(
            {
                "inputs": [[1_000_000.0]] * 8,
                "expects": [[0.0]] * 8,
            }
        )
        dataset = self.make_dataset(content=explosive, input_cols=1, total_rows=8)

        response = self.train(network.id, dataset.id)

        self.assertEqual(response.status_code, 422)
        self.assertIn("finitos", response.json()["detail"])
        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.DRAFT)
        self.assertIsNone(network.weights)
        self.assertEqual(Run.objects.count(), 0)
