import json
from unittest.mock import patch

from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model

from core.apitest import ApiTransactionTestBase, auth_headers, rand_suffix
from datasets.models import Dataset

from .models import Network, Run

XOR_JSON = json.dumps(
    {
        "inputs": [[0, 0], [0, 1], [1, 0], [1, 1]] * 4,
        "expects": [[0], [1], [1], [0]] * 4,
    }
)

XOR_CSV = "0.0,0.0,0.0\n0.0,1.0,1.0\n1.0,0.0,1.0\n1.0,1.0,0.0\n" * 4

DIVERGENT_JSON = json.dumps({"inputs": [[1e6]] * 8, "expects": [[0.0]] * 8})


def parse_frames(chunks):
    frames = []
    for chunk in chunks:
        text = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
        for block in text.split("\n\n"):
            if not block.strip():
                continue
            lines = block.splitlines()
            event = next(line[7:] for line in lines if line.startswith("event: "))
            data = json.loads(next(line[6:] for line in lines if line.startswith("data: ")))
            frames.append((event, data))
    return frames


def collect(response):
    async def consume():
        return [chunk async for chunk in response.streaming_content]

    return parse_frames(async_to_sync(consume)())


def collect_partial(response, count):
    async def consume():
        iterator = response.streaming_content.__aiter__()
        chunks = [await anext(iterator) for _ in range(count)]
        await iterator.aclose()
        return chunks

    return parse_frames(async_to_sync(consume)())


class StreamEndpointTests(ApiTransactionTestBase):
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
            "epochs": 5,
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

    def train(self, network_id, dataset_id, stream):
        extra = {**self.auth, "REMOTE_ADDR": self.remote_ip}
        if stream:
            extra["HTTP_ACCEPT"] = "text/event-stream"
        return self.client.post(
            f"/api/networks/{network_id}/train",
            data=json.dumps({"dataset_id": dataset_id}),
            content_type="application/json",
            **extra,
        )

    def test_stream_emits_start_epochs_and_final(self):
        network = self.make_network()
        dataset = self.make_dataset()

        response = self.train(network.id, dataset.id, stream=True)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Type"].startswith("text/event-stream"))
        self.assertIn("no-cache", response["Cache-Control"])

        frames = collect(response)
        events = [event for event, _ in frames]

        self.assertEqual(events, ["start"] + ["epoch"] * 5 + ["final"])
        start = frames[0][1]
        self.assertEqual(start, {"epochs": 5, "train_rows": 12, "test_rows": 4})
        self.assertEqual(
            [data["epoch"] for event, data in frames[1:-1]],
            [1, 2, 3, 4, 5],
        )
        for _, data in frames[1:-1]:
            self.assertIn("loss_train", data)
            self.assertIn("loss_test", data)
            self.assertIsNotNone(data["loss_test"])

        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.TRAINED)
        self.assertIsNotNone(network.weights)

        runs = self.get_json(f"/api/networks/{network.id}/runs").json()
        self.assertEqual(len(runs), 1)
        self.assertEqual(frames[-1][1], runs[0])
        self.assertEqual(
            set(runs[0]),
            {"id", "mse_loss", "r_square", "accuracy", "dataset"},
        )
        self.assertEqual(Run.objects.filter(network=network).count(), 1)

    def test_stream_csv_dataset(self):
        network = self.make_network(epochs=3)
        dataset = self.make_dataset(
            content=XOR_CSV, source_type=Dataset.SourceType.CSV
        )

        frames = collect(self.train(network.id, dataset.id, stream=True))

        self.assertEqual([event for event, _ in frames][0], "start")
        self.assertEqual([event for event, _ in frames][-1], "final")
        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.TRAINED)

    def test_stream_matches_one_shot_metrics_and_weights(self):
        one_shot_network = self.make_network()
        stream_network = self.make_network()
        dataset = self.make_dataset()

        one_shot = self.train(one_shot_network.id, dataset.id, stream=False)
        self.assertEqual(one_shot.status_code, 201)
        self.assertTrue(one_shot["Content-Type"].startswith("application/json"))

        frames = collect(self.train(stream_network.id, dataset.id, stream=True))
        final = frames[-1][1]
        run = one_shot.json()

        self.assertEqual(final["mse_loss"], run["mse_loss"])
        self.assertEqual(final["r_square"], run["r_square"])
        self.assertEqual(final["accuracy"], run["accuracy"])
        self.assertEqual(final["dataset"], run["dataset"])

        one_shot_network.refresh_from_db()
        stream_network.refresh_from_db()
        self.assertEqual(stream_network.weights, one_shot_network.weights)

    def test_cancellation_resets_to_draft_without_run(self):
        network = self.make_network(epochs=50)
        dataset = self.make_dataset()

        response = self.train(network.id, dataset.id, stream=True)
        frames = collect_partial(response, 3)

        self.assertEqual(len(frames), 3)
        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.DRAFT)
        self.assertIsNone(network.weights)
        self.assertEqual(Run.objects.filter(network=network).count(), 0)

    def test_divergence_emits_error_and_stays_draft(self):
        network = self.make_network(
            layers=[
                {"size": 1, "activation": "linear"},
                {"size": 1, "activation": "linear"},
            ],
            epochs=3,
            learning_rate=1.0,
        )
        dataset = self.make_dataset(
            content=DIVERGENT_JSON,
            total_rows=8,
            input_cols=1,
            output_cols=1,
        )

        frames = collect(self.train(network.id, dataset.id, stream=True))

        self.assertEqual([event for event, _ in frames], ["start", "error"])
        self.assertEqual(frames[1][1]["code"], "divergence")
        self.assertIn("finitos", frames[1][1]["message"])

        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.DRAFT)
        self.assertIsNone(network.weights)
        self.assertEqual(Run.objects.filter(network=network).count(), 0)

    def test_unexpected_engine_error_restores_previous_state(self):
        previous_weights = {"previo": True}
        network = self.make_network(
            state=Network.State.TRAINED, weights=previous_weights
        )
        dataset = self.make_dataset()

        class FailingTrainer:
            def start_info(self):
                return json.dumps({"epochs": 5, "train_rows": 12, "test_rows": 4})

            def next_epoch(self):
                raise ValueError("engine::unexpected: fallo simulado")

            def result(self):
                raise AssertionError("no debe llegar al resultado")

        with patch("networks.streaming.make_trainer", return_value=FailingTrainer()):
            frames = collect(self.train(network.id, dataset.id, stream=True))

        self.assertEqual([event for event, _ in frames], ["start", "error"])
        self.assertEqual(frames[1][1]["code"], "unexpected")
        self.assertIn("fallo simulado", frames[1][1]["message"])

        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.TRAINED)
        self.assertEqual(network.weights, previous_weights)
        self.assertEqual(Run.objects.filter(network=network).count(), 0)

    def test_validation_rejected_with_stream_request_is_plain_422(self):
        network = self.make_network(
            layers=[
                {"size": 3, "activation": "linear"},
                {"size": 1, "activation": "tanh"},
            ]
        )
        dataset = self.make_dataset()

        response = self.train(network.id, dataset.id, stream=True)

        self.assertEqual(response.status_code, 422)
        self.assertTrue(response["Content-Type"].startswith("application/json"))
        self.assertFalse(response.streaming)
        self.assertIn("entradas", response.json()["detail"])

        network.refresh_from_db()
        self.assertEqual(network.state, Network.State.DRAFT)
        self.assertEqual(Run.objects.filter(network=network).count(), 0)

    def test_second_request_while_training_is_409_in_both_modes(self):
        network = self.make_network(state=Network.State.TRAINING)
        dataset = self.make_dataset()

        one_shot = self.train(network.id, dataset.id, stream=False)
        stream = self.train(network.id, dataset.id, stream=True)

        self.assertEqual(one_shot.status_code, 409)
        self.assertEqual(stream.status_code, 409)
        self.assertTrue(stream["Content-Type"].startswith("application/json"))
        self.assertEqual(Run.objects.count(), 0)
