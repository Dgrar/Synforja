import json
import time

from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model

from core.apitest import ApiTestBase, ApiTransactionTestBase, rand_suffix
from networks.models import Network, Run

NET_TARGET_MS = 200.0
DATASET_TARGET_MS = 2000.0
TRAIN_TARGET_MS = 300_000.0
RUNS_TARGET_MS = 200.0
STREAM_CADENCE_TARGET_MS = 10_000.0
STREAM_FACTOR_TARGET = 2.0
STREAM_SIZE_TARGET_BYTES = 2 * 1024 * 1024

TRAIN_REFERENCE_ROWS = 5_000
TRAIN_REFERENCE_EPOCHS = 1_000
STREAM_SIZE_EPOCHS = 10_000

API_NET = {
    "name": "perf",
    "layers": [
        {"size": 16, "activation": "relu"},
        {"size": 8, "activation": "tanh"},
        {"size": 2, "activation": "linear"},
    ],
    "epochs": 50,
    "learning_rate": 0.05,
    "loss": "mse",
    "training_split": 0.8,
}

TRAIN_REFERENCE_NET = {
    "name": "referencia",
    "layers": [
        {"size": 7, "activation": "relu"},
        {"size": 64, "activation": "relu"},
        {"size": 64, "activation": "relu"},
        {"size": 1, "activation": "linear"},
    ],
    "epochs": TRAIN_REFERENCE_EPOCHS,
    "learning_rate": 0.01,
    "loss": "mse",
    "training_split": 0.8,
    "seed": 42,
}


def dataset_50k_csv() -> str:
    factors = (3.5, 1.5, 7.25, 0.125, 97.0, 11.0, 3.0, 123.0)
    rows = (
        ",".join(f"{i * factor:.4f}" for factor in factors) for i in range(50_000)
    )
    return "\n".join(rows)


def train_reference_csv() -> str:
    rows = []
    for i in range(TRAIN_REFERENCE_ROWS):
        inputs = [((i * factor) % 101) / 101.0 for factor in (1, 3, 7, 11, 17, 23, 29)]
        target = sum(inputs) / len(inputs)
        rows.append(",".join(f"{value:.4f}" for value in [*inputs, target]))
    return "\n".join(rows)


def p95(values: list[float]) -> float:
    return sorted(values)[max(0, int(0.95 * len(values)) - 1)]


def ms(start: float) -> float:
    return (time.perf_counter() - start) * 1000.0


class PerformanceTests(ApiTestBase):
    """RNF de las fases 000 y 001: se corren por tarea (manage.py test core.perf), no en la suite general."""

    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_user(
            username=f"perf_{rand_suffix()}", password="xK9mQ2pLz1!"
        )
        self.auth_user()

    def auth_user(self):
        from core.apitest import auth_headers

        self.auth = auth_headers(self.user)

    def test_rnf1_crud_network_below_200ms(self):
        Network.objects.bulk_create(
            Network(
                user=self.user,
                name=f"n{i}",
                layers=[{"size": 4, "activation": "relu"}, {"size": 1, "activation": "linear"}],
                epochs=10,
                learning_rate=0.1,
                loss="mse",
                training_split=0.5,
                seed=i,
            )
            for i in range(100)
        )

        list_times = []
        for _ in range(20):
            start = time.perf_counter()
            response = self.get_json("/api/networks")
            self.assertEqual(response.status_code, 200, response.content)
            list_times.append(ms(start))

        networks_list = response.json()
        detail_id = networks_list[0]["id"]

        detail_times = []
        for _ in range(20):
            start = time.perf_counter()
            response = self.get_json(f"/api/networks/{detail_id}")
            self.assertEqual(response.status_code, 200)
            detail_times.append(ms(start))

        create_times = []
        for _ in range(10):
            start = time.perf_counter()
            response = self.post_json("/api/networks", API_NET)
            self.assertEqual(response.status_code, 201, response.content)
            create_times.append(ms(start))

        patch_times = []
        for index in range(10):
            start = time.perf_counter()
            response = self.patch_json(f"/api/networks/{detail_id}", {"name": f"editada_{index}"})
            self.assertEqual(response.status_code, 200, response.content)
            patch_times.append(ms(start))

        delete_times = []
        first_ten = list(Network.objects.filter(user=self.user).order_by("id")[:10])
        for network in first_ten:
            start = time.perf_counter()
            response = self.delete_json(f"/api/networks/{network.id}")
            self.assertEqual(response.status_code, 204)
            delete_times.append(ms(start))

        results = {
            "list_p95_ms": p95(list_times),
            "detail_p95_ms": p95(detail_times),
            "create_p95_ms": p95(create_times),
            "patch_p95_ms": p95(patch_times),
            "delete_p95_ms": p95(delete_times),
        }
        for label, value in results.items():
            print(f"[RNF-1] {label}: {value:.1f} ms")
            self.assertLess(value, NET_TARGET_MS, f"{label} = {value} ms")

    def test_rnf2_dataset_5mb_50k_rows_below_2s(self):
        content = dataset_50k_csv()
        size_mb = len(content.encode("utf-8")) / (1024 * 1024)
        self.assertLess(size_mb, 5.0)

        start = time.perf_counter()
        response = self.post_json(
            "/api/datasets",
            {
                "source_type": "csv",
                "name": "enorme",
                "content": content,
                "input_cols": 7,            },
        )
        elapsed = ms(start)
        self.assertEqual(response.status_code, 201, response.content[:200])
        self.assertEqual(response.json()["total_rows"], 50_000)
        print(f"[RNF-2] content_size_mb: {size_mb:.2f}")
        print(f"[RNF-2] upload_ms: {elapsed:.1f} ms")
        self.assertLess(elapsed, DATASET_TARGET_MS)

        dataset_id = response.json()["id"]
        start = time.perf_counter()
        response = self.get_json(f"/api/datasets/{dataset_id}/content")
        self.assertEqual(response.status_code, 200)
        print(f"[RNF-2] content_fetch_ms: {ms(start):.1f} ms")
    # Comprueba que tarda menos de 5 mins
    def test_rnf1_train_reference_below_5min(self):
        start = time.perf_counter()
        response = self.post_json(
            "/api/datasets",
            {
                "source_type": "csv",
                "name": "referencia",
                "content": train_reference_csv(),
                "input_cols": 7,
            },
        )
        dataset_elapsed = ms(start)
        self.assertEqual(response.status_code, 201, response.content[:200])
        dataset_id = response.json()["id"]

        network = self.post_json("/api/networks", TRAIN_REFERENCE_NET)
        self.assertEqual(network.status_code, 201, network.content[:200])
        network_id = network.json()["id"]

        start = time.perf_counter()
        response = self.post_json(
            f"/api/networks/{network_id}/train", {"dataset_id": dataset_id}
        )
        elapsed = ms(start)

        self.assertEqual(response.status_code, 201, response.content[:500])
        body = response.json()
        print(f"[RNF-1/001] dataset_setup_ms: {dataset_elapsed:.1f} ms")
        print(f"[RNF-1/001] train_reference_ms: {elapsed:.1f} ms")
        print(f"[RNF-1/001] mse_loss: {body['mse_loss']}")
        print(f"[RNF-1/001] r_square: {body['r_square']}")
        self.assertLess(elapsed, TRAIN_TARGET_MS)

    def test_rnf3_runs_list_below_200ms(self):
        network = Network.objects.create(
            user=self.user,
            name="muchos_runs",
            layers=[
                {"size": 4, "activation": "relu"},
                {"size": 1, "activation": "linear"},
            ],
            epochs=10,
            learning_rate=0.1,
            loss="mse",
            training_split=0.8,
            seed=1,
        )
        Run.objects.bulk_create(
            Run(
                network=network,
                dataset_id=i + 1,
                total_rows=100,
                input_cols=4,
                output_cols=1,
                mse_loss=0.1,
                r_square=0.9,
                accuracy=0.8,
            )
            for i in range(100)
        )

        times = []
        for _ in range(20):
            start = time.perf_counter()
            response = self.get_json(f"/api/networks/{network.id}/runs")
            self.assertEqual(response.status_code, 200, response.content[:200])
            times.append(ms(start))

        self.assertEqual(len(response.json()), 100)
        value = p95(times)
        print(f"[RNF-3/001] runs_list_p95_ms: {value:.1f} ms")
        self.assertLess(value, RUNS_TARGET_MS)

class StreamingPerformanceTests(ApiTransactionTestBase):
    """RNF de la fase 002 (streaming SSE): se corren por tarea, no en la suite general."""

    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_user(
            username=f"perf_{rand_suffix()}", password="xK9mQ2pLz1!"
        )
        from core.apitest import auth_headers

        self.auth = auth_headers(self.user)

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

    def consume(self, response):
        async def run():
            start = time.perf_counter()
            chunks = []
            async for chunk in response.streaming_content:
                text = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
                chunks.append((ms(start), text))
            return chunks

        return async_to_sync(run)()

    def reference(self):
        response = self.post_json(
            "/api/datasets",
            {
                "source_type": "csv",
                "name": "referencia",
                "content": train_reference_csv(),
                "input_cols": 7,
            },
        )
        self.assertEqual(response.status_code, 201, response.content[:200])
        dataset_id = response.json()["id"]

        network = self.post_json("/api/networks", TRAIN_REFERENCE_NET)
        self.assertEqual(network.status_code, 201, network.content[:200])
        return dataset_id, network.json()["id"]

    def test_rnf1_rnf2_streaming_reference(self):
        dataset_id, network_id = self.reference()

        start = time.perf_counter()
        one_shot = self.train(network_id, dataset_id, stream=False)
        self.assertEqual(one_shot.status_code, 201, one_shot.content[:300])
        one_shot_ms = ms(start)

        second = self.post_json("/api/networks", TRAIN_REFERENCE_NET)
        stream_network_id = second.json()["id"]
        start = time.perf_counter()
        response = self.train(stream_network_id, dataset_id, stream=True)
        self.assertEqual(response.status_code, 200)
        chunks = self.consume(response)
        stream_ms = ms(start)

        epoch_times = [
            offset for offset, chunk in chunks
            if chunk.startswith("event: epoch")
        ]
        self.assertEqual(len(epoch_times), TRAIN_REFERENCE_EPOCHS)

        first_epoch_ms = epoch_times[0]
        gaps = [
            later - earlier
            for earlier, later in zip(epoch_times, epoch_times[1:])
        ]
        cadence_ms = p95(gaps)
        ratio = stream_ms / one_shot_ms

        print(f"[RNF-1/002] first_epoch_ms: {first_epoch_ms:.1f} ms")
        print(f"[RNF-1/002] epoch_gap_p95_ms: {cadence_ms:.1f} ms")
        print(f"[RNF-2/002] one_shot_ms: {one_shot_ms:.1f} ms")
        print(f"[RNF-2/002] stream_ms: {stream_ms:.1f} ms")
        print(f"[RNF-2/002] ratio: {ratio:.2f}x")

        self.assertLess(first_epoch_ms, STREAM_CADENCE_TARGET_MS)
        self.assertLess(cadence_ms, STREAM_CADENCE_TARGET_MS)
        self.assertLess(ratio, STREAM_FACTOR_TARGET)

    def test_rnf3_stream_size_10k_epochs_below_2mb(self):
        inputs = [[0, 0], [0, 1], [1, 0], [1, 1]] * 4
        expects = [[0], [1], [1], [0]] * 4
        response = self.post_json(
            "/api/datasets",
            {
                "source_type": "json",
                "name": "xor",
                "content": {"inputs": inputs, "expects": expects},
            },
        )
        self.assertEqual(response.status_code, 201, response.content[:200])
        dataset_id = response.json()["id"]

        network = self.post_json(
            "/api/networks",
            {
                "name": "xor_10k",
                "layers": [
                    {"size": 2, "activation": "linear"},
                    {"size": 4, "activation": "tanh"},
                    {"size": 1, "activation": "tanh"},
                ],
                "epochs": STREAM_SIZE_EPOCHS,
                "learning_rate": 0.2,
                "loss": "mse",
                "training_split": 0.8,
                "seed": 42,
            },
        )
        self.assertEqual(network.status_code, 201, network.content[:200])

        start = time.perf_counter()
        response = self.train(network.json()["id"], dataset_id, stream=True)
        chunks = self.consume(response)
        total_bytes = sum(len(chunk) for _, chunk in chunks)
        elapsed = ms(start)

        print(f"[RNF-3/002] stream_10k_bytes: {total_bytes}")
        print(f"[RNF-3/002] stream_10k_ms: {elapsed:.1f} ms")
        self.assertLess(total_bytes, STREAM_SIZE_TARGET_BYTES)
