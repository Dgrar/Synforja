import time

from django.contrib.auth import get_user_model

from core.apitest import ApiTestBase, rand_suffix
from networks.models import Network

NET_TARGET_MS = 200.0
DATASET_TARGET_MS = 2000.0

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


def dataset_50k_csv() -> str:
    factors = (3.5, 1.5, 7.25, 0.125, 97.0, 11.0, 3.0, 123.0)
    rows = (
        ",".join(f"{i * factor:.4f}" for factor in factors) for i in range(50_000)
    )
    return "\n".join(rows)


def p95(values: list[float]) -> float:
    return sorted(values)[max(0, int(0.95 * len(values)) - 1)]


def ms(start: float) -> float:
    return (time.perf_counter() - start) * 1000.0


class PerformanceTests(ApiTestBase):
    """RNF-1/RNF-2: se corren por tarea (manage.py test core.perf), no en la suite general."""

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
