import json
from unittest.mock import patch

import engine_core
from django.contrib.auth import get_user_model

from core.apitest import ApiTestBase, auth_headers, rand_suffix
from datasets.models import Dataset

from .models import Network

XOR_JSON = json.dumps(
    {
        "inputs": [[0, 0], [0, 1], [1, 0], [1, 1]] * 4,
        "expects": [[0], [1], [1], [0]] * 4,
    }
)


class PredictAndWeightsTests(ApiTestBase):
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
            "epochs": 20,
            "learning_rate": 0.1,
            "loss": "mse",
            "training_split": 0.8,
            "seed": 42,
        }
        values.update(overrides)
        return Network.objects.create(**values)

    def make_dataset(self, user=None):
        return Dataset.objects.create(
            user=user or self.user,
            name="xor",
            source_type=Dataset.SourceType.JSON,
            content=XOR_JSON,
            total_rows=16,
            input_cols=2,
            output_cols=1,
        )

    def train(self, network):
        dataset = self.make_dataset()
        response = self.post_json(
            f"/api/networks/{network.id}/train", {"dataset_id": dataset.id}
        )
        self.assertEqual(response.status_code, 201)
        return response.json()

    def test_predict_after_training(self):
        network = self.make_network()
        self.train(network)

        response = self.post_json(
            f"/api/networks/{network.id}/predict", {"input": [0.0, 1.0]}
        )

        self.assertEqual(response.status_code, 200)
        output = response.json()["output"]
        self.assertEqual(len(output), 1)
        self.assertTrue(all(value == value for value in output))

    def test_predict_requires_trained_state(self):
        network = self.make_network()

        response = self.post_json(
            f"/api/networks/{network.id}/predict", {"input": [0.0, 1.0]}
        )

        self.assertEqual(response.status_code, 409)

    def test_predict_trained_without_weights_is_409(self):
        network = self.make_network(state=Network.State.TRAINED, weights=None)

        response = self.post_json(
            f"/api/networks/{network.id}/predict", {"input": [0.0, 1.0]}
        )

        self.assertEqual(response.status_code, 409)

    def test_predict_wrong_length_is_422(self):
        network = self.make_network()
        self.train(network)

        response = self.post_json(
            f"/api/networks/{network.id}/predict", {"input": [1.0]}
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("2 valores", response.json()["detail"])

    def test_predict_non_finite_is_422(self):
        network = self.make_network()
        self.train(network)

        response = self.post_json(
            f"/api/networks/{network.id}/predict",
            {"input": [float("nan"), 0.0]},
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("no finitos", response.json()["detail"])

    def test_predict_foreign_network_is_404(self):
        network = self.make_network(user=self.other)

        response = self.post_json(
            f"/api/networks/{network.id}/predict", {"input": [0.0, 1.0]}
        )

        self.assertEqual(response.status_code, 404)

    def test_predict_requires_auth(self):
        network = self.make_network()
        self.auth = {}

        response = self.post_json(
            f"/api/networks/{network.id}/predict", {"input": [0.0, 1.0]}
        )

        self.assertEqual(response.status_code, 401)

    def test_weights_dump_after_training(self):
        network = self.make_network()
        self.train(network)

        response = self.get_json(f"/api/networks/{network.id}/weights")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            body["config"]["layers"],
            [
                {"size": 2, "activation": "linear"},
                {"size": 4, "activation": "tanh"},
                {"size": 1, "activation": "tanh"},
            ],
        )
        self.assertEqual(body["config"]["seed"], 42)
        self.assertEqual(body["config"]["epochs"], 20)
        self.assertEqual(body["config"]["learning_rate"], 0.1)
        self.assertEqual(body["config"]["loss"], "mse")
        self.assertEqual(body["config"]["training_split"], 0.8)
        self.assertEqual(len(body["network"]["weights"]), 2 * 4 + 4 * 1)
        self.assertEqual(len(body["network"]["biases"]), 4 + 1)
        self.assertEqual(len(body["network"]["topology"]), 3)

    def test_weights_roundtrip_reproduces_predictions(self):
        network = self.make_network()
        self.train(network)
        dump = self.get_json(f"/api/networks/{network.id}/weights").json()

        for vector in ([0.0, 0.0], [0.0, 1.0], [1.0, 1.0]):
            response = self.post_json(
                f"/api/networks/{network.id}/predict", {"input": vector}
            )
            self.assertEqual(response.status_code, 200)
            replay = engine_core.predict_json(json.dumps(dump["network"]), vector)
            self.assertEqual(response.json()["output"], replay)

        metrics = json.loads(
            engine_core.evaluate_json(json.dumps(dump["network"]), XOR_JSON)
        )
        self.assertIn("mse_loss", metrics)

    def test_weights_draft_is_409(self):
        network = self.make_network()

        response = self.get_json(f"/api/networks/{network.id}/weights")

        self.assertEqual(response.status_code, 409)

    def test_weights_estimate_over_limit_is_413(self):
        network = self.make_network(
            state=Network.State.TRAINED,
            weights={},
            layers=[
                {"size": 2, "activation": "linear"},
                {"size": 2048, "activation": "relu"},
                {"size": 2048, "activation": "relu"},
            ],
        )

        response = self.get_json(f"/api/networks/{network.id}/weights")

        self.assertEqual(response.status_code, 413)

    def test_weights_real_size_over_limit_is_413(self):
        network = self.make_network()
        self.train(network)

        with (
            patch("networks.api.estimate_dump_bytes", return_value=0),
            patch("networks.api.MAX_DUMP_BYTES", 10),
        ):
            response = self.get_json(f"/api/networks/{network.id}/weights")

        self.assertEqual(response.status_code, 413)

    def test_weights_foreign_network_is_404(self):
        network = self.make_network(user=self.other)

        response = self.get_json(f"/api/networks/{network.id}/weights")

        self.assertEqual(response.status_code, 404)
