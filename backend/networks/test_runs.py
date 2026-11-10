import json

from django.contrib.auth import get_user_model

from core.apitest import ApiTestBase, auth_headers, rand_suffix
from datasets.models import Dataset

from .models import Network, Run

XOR_JSON = json.dumps(
    {
        "inputs": [[0, 0], [0, 1], [1, 0], [1, 1]] * 4,
        "expects": [[0], [1], [1], [0]] * 4,
    }
)

XOR_CSV = "0.0,0.0,0.0\n0.0,1.0,1.0\n1.0,0.0,1.0\n1.0,1.0,0.0\n" * 4


class RunsEndpointTests(ApiTestBase):
    # Para setupear el usuario y el otro usuario para el resto de tests
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
    # Para crear la red neuronal en sí
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
    # Crear el dataset
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
    
    def train(self, network, dataset):
        return self.post_json(
            f"/api/networks/{network.id}/train", {"dataset_id": dataset.id}
        )
    # Comprobamos comportamiento correcto ante lista vacía
    def test_runs_empty_list(self):
        network = self.make_network()

        response = self.get_json(f"/api/networks/{network.id}/runs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_runs_order_is_descending_with_snapshots(self):
        network = self.make_network()
        json_dataset = self.make_dataset()
        csv_dataset = self.make_dataset(
            content=XOR_CSV, source_type=Dataset.SourceType.CSV
        )

        first = self.train(network, json_dataset).json()
        second = self.train(network, csv_dataset).json()
        third = self.train(network, json_dataset).json()

        response = self.get_json(f"/api/networks/{network.id}/runs")

        self.assertEqual(response.status_code, 200)
        runs = response.json()
        self.assertEqual([run["id"] for run in runs], [third["id"], second["id"], first["id"]])
        self.assertEqual(runs[1]["dataset"]["id"], csv_dataset.id)
        self.assertEqual(runs[0]["dataset"]["id"], json_dataset.id)
        for run in runs:
            self.assertEqual(
                run["dataset"],
                {
                    "id": run["dataset"]["id"],
                    "total_rows": 16,
                    "input_cols": 2,
                    "output_cols": 1,
                },
            )
            self.assertIn("mse_loss", run)
            self.assertIn("r_square", run)
            self.assertIn("accuracy", run)

    def test_runs_foreign_network_is_404(self):
        network = self.make_network(user=self.other)

        response = self.get_json(f"/api/networks/{network.id}/runs")

        self.assertEqual(response.status_code, 404)

    def test_runs_requires_auth(self):
        network = self.make_network()
        self.auth = {}

        response = self.get_json(f"/api/networks/{network.id}/runs")

        self.assertEqual(response.status_code, 401)

    def test_runs_survive_dataset_deletion(self):
        network = self.make_network()
        dataset = self.make_dataset()
        dataset_id = dataset.id
        run_body = self.train(network, dataset).json()

        dataset.delete()

        response = self.get_json(f"/api/networks/{network.id}/runs")

        self.assertEqual(response.status_code, 200)
        runs = response.json()
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["id"], run_body["id"])
        self.assertEqual(
            runs[0]["dataset"],
            {"id": dataset_id, "total_rows": 16, "input_cols": 2, "output_cols": 1},
        )

    def test_edit_trained_network_clears_weights_and_keeps_runs(self):
        network = self.make_network()
        dataset = self.make_dataset()
        run_body = self.train(network, dataset).json()

        network.refresh_from_db()
        self.assertIsNotNone(network.weights)

        response = self.patch_json(f"/api/networks/{network.id}", {"name": "renombrada"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["state"], "draft")

        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.DRAFT)
        self.assertIsNone(network.weights)

        runs = self.get_json(f"/api/networks/{network.id}/runs").json()
        self.assertEqual([run["id"] for run in runs], [run_body["id"]])
        self.assertEqual(runs[0]["mse_loss"], run_body["mse_loss"])

    def test_delete_network_cascades_runs(self):
        network = self.make_network()
        dataset = self.make_dataset()
        self.train(network, dataset)
        self.assertEqual(Run.objects.count(), 1)

        response = self.delete_json(f"/api/networks/{network.id}")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(Run.objects.count(), 0)
