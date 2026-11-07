from django.test import SimpleTestCase, TestCase, override_settings
from django.contrib.auth import get_user_model

from pydantic import ValidationError

from core.apitest import ApiTestBase, auth_headers
from .models import Network
from .schemas import MAX_LAYERS, MAX_LAYER_NEURONS, NetworkIn, NetworkPatchIn
from .seed import SEED_MAX, generate_seed

VALID = {
    "name": "xor",
    "layers": [
        {"size": 2, "activation": "relu"},
        {"size": 1, "activation": "linear"},
    ],
    "epochs": 100,
    "learning_rate": 0.01,
    "loss": "mse",
    "training_split": 0.8,
}


class NetworkSchemaValidationTests(SimpleTestCase):
    def validate(self, payload):
        return NetworkIn(**payload)

    def test_valid_minimal(self):
        n = self.validate(dict(VALID))
        self.assertEqual(n.seed, None)
        self.assertEqual(n.layers[1].activation, "linear")

    def test_name_max_length(self):
        payload = dict(VALID, name="a" * 101)
        with self.assertRaises(ValidationError):
            self.validate(payload)

    def test_layers_min_two(self):
        payload = dict(VALID, layers=VALID["layers"][:1])
        with self.assertRaises(ValidationError):
            self.validate(payload)

    def test_layers_empty(self):
        payload = dict(VALID, layers=[])
        with self.assertRaises(ValidationError):
            self.validate(payload)

    def test_layer_size_zero(self):
        layers = [*VALID["layers"]]
        layers[0] = {"size": 0, "activation": "relu"}
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, layers=layers))

    def test_layer_size_negative(self):
        layers = [*VALID["layers"]]
        layers[1] = {"size": -2, "activation": "linear"}
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, layers=layers))

    def test_activation_unknown(self):
        layers = [*VALID["layers"]]
        layers[1] = {"size": 1, "activation": "gelu"}
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, layers=layers))

    def test_activation_case_insensitive(self):
        layers = [{"size": 2, "activation": "ReLU"}, {"size": 1, "activation": "Linear"}]
        n = self.validate(dict(VALID, layers=layers))
        self.assertEqual(n.layers[0].activation, "relu")
        self.assertEqual(n.layers[1].activation, "linear")

    def test_epochs_zero(self):
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, epochs=0))

    def test_epochs_negative(self):
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, epochs=-5))

    def test_learning_rate_zero(self):
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, learning_rate=0))

    def test_learning_rate_negative(self):
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, learning_rate=-0.01))

    def test_loss_unknown(self):
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, loss="crossentropy"))

    def test_split_zero(self):
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, training_split=0))

    def test_split_one(self):
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, training_split=1))

    def test_split_negative(self):
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, training_split=-0.2))

    def test_split_out_of_range(self):
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, training_split=1.5))

    def test_seed_negative(self):
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, seed=-1))

    def test_seed_above_max(self):
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, seed=SEED_MAX + 1))

    def test_seed_valid_explicit(self):
        n = self.validate(dict(VALID, seed=42))
        self.assertEqual(n.seed, 42)

    def test_layer_size_above_max(self):
        with self.assertRaises(ValidationError):
            self.validate(
                dict(
                    VALID,
                    layers=[{"size": MAX_LAYER_NEURONS + 1, "activation": "relu"}],
                )
            )

    def test_layer_size_at_max_ok(self):
        self.validate(
            dict(
                VALID,
                layers=[
                    {"size": MAX_LAYER_NEURONS, "activation": "relu"},
                    {"size": 1, "activation": "linear"},
                ],
            )
        )

    def test_layers_above_max_count(self):
        too_many = [{"size": 4, "activation": "relu"} for _ in range(MAX_LAYERS + 1)]
        with self.assertRaises(ValidationError):
            self.validate(dict(VALID, layers=too_many))

    def test_layers_at_max_count_ok(self):
        exactly_max = [
            {"size": 8, "activation": "relu"} if i < MAX_LAYERS - 1 else {"size": 1, "activation": "linear"}
            for i in range(MAX_LAYERS)
        ]
        self.validate(dict(VALID, layers=exactly_max))


class SeedTests(SimpleTestCase):
    def test_within_range(self):
        for _ in range(200):
            seed = generate_seed()
            self.assertTrue(0 <= seed <= SEED_MAX)

    def test_not_constant(self):
        values = {generate_seed() for _ in range(50)}
        self.assertGreater(len(values), 1)


class NetworkModelTests(TestCase):
    def test_create_defaults(self):
        user = get_user_model().objects.create_user(
            username="modelua", password="xK9mQ2pLz1!"
        )
        network = Network.objects.create(
            user=user,
            name="red",
            layers=[{"size": 2, "activation": "relu"}],
            epochs=10,
            learning_rate=0.1,
            loss=Network.Loss.MSE,
            training_split=0.5,
            seed=generate_seed(),
        )
        self.assertEqual(network.state, Network.State.DRAFT)
        self.assertEqual(network.type, "MLP")
        self.assertIsNotNone(network.created_at)

    def test_state_choices(self):
        self.assertEqual(
            {c[0] for c in Network.State.choices}, {"draft", "training", "trained"}
        )


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
class NetworksAPIPatchSchemaTests(SimpleTestCase):
    def test_patch_all_optional(self):
        self.assertTrue(hasattr(NetworkPatchIn.model_validate({}), "name"))

    def test_patch_invalid_optional_branches(self):
        with self.assertRaises(ValidationError):
            NetworkPatchIn.model_validate({"epochs": 0})
        with self.assertRaises(ValidationError):
            NetworkPatchIn.model_validate({"learning_rate": -1})
        with self.assertRaises(ValidationError):
            NetworkPatchIn.model_validate({"training_split": 1})
        with self.assertRaises(ValidationError):
            NetworkPatchIn.model_validate({"loss": "crossentropy"})


NETWORKS_URL = "/api/networks"


def rand10() -> str:
    import uuid

    return uuid.uuid4().hex[:10]


API_VALID = {
    "name": "xor",
    "layers": [
        {"size": 2, "activation": "relu"},
        {"size": 1, "activation": "linear"},
    ],
    "epochs": 100,
    "learning_rate": 0.01,
    "loss": "mse",
    "training_split": 0.8,
}


class NetworksAPIBase(ApiTestBase):
    def create_user_pair(self):
        User = get_user_model()
        return (
            User.objects.create_user(username=f"a_{rand10()}", password="xK9mQ2pLz1!"),
            User.objects.create_user(username=f"b_{rand10()}", password="xK9mQ2pLz1!"),
        )

    def create_network(self, user, overrides: dict | None = None) -> int:
        self.auth = auth_headers(user)
        payload = dict(API_VALID, **(overrides or {}))
        response = self.post_json(NETWORKS_URL, payload)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["id"]


class NetworksCreateTests(NetworksAPIBase):
    def test_create_returns_201_draft_with_generated_seed(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        response = self.post_json(NETWORKS_URL, API_VALID)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["state"], "draft")
        self.assertEqual(data["type"], "MLP")
        self.assertTrue(0 <= data["seed"] <= SEED_MAX)

    def test_create_respects_explicit_seed(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        response = self.post_json(NETWORKS_URL, dict(API_VALID, seed=42))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["seed"], 42)

    def test_create_accumulates_violations(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        payload = dict(
            API_VALID,
            layers=[{"size": 2, "activation": "relu"}],
            epochs=0,
            learning_rate=0,
        )
        response = self.post_json(NETWORKS_URL, payload)
        self.assertEqual(response.status_code, 422)
        detail = response.json()["detail"]
        self.assertEqual(len(detail), 3)

    def test_create_over_network_caps_rejected(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        payload = dict(
            API_VALID,
            layers=[
                {"size": 8, "activation": "relu"} for _ in range(MAX_LAYERS + 1)
            ],
        )
        response = self.post_json(NETWORKS_URL, payload)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(len(response.json()["detail"]), 1)


class NetworksListDetailTests(NetworksAPIBase):
    def test_detail_returns_full_config(self):
        user, _ = self.create_user_pair()
        network_id = self.create_network(user, {"seed": 7, "name": "detalle"})
        self.auth = auth_headers(user)
        response = self.get_json(f"{NETWORKS_URL}/{network_id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["seed"], 7)
        self.assertEqual(data["name"], "detalle")
        self.assertEqual(len(data["layers"]), 2)
        self.assertEqual(data["loss"], "mse")

    def test_list_only_own_desc(self):
        user_a, user_b = self.create_user_pair()
        first_id = self.create_network(user_a)
        second_id = self.create_network(user_a, {"name": "segunda"})
        user_b_id = self.create_network(user_b)

        self.auth = auth_headers(user_a)
        response = self.get_json(NETWORKS_URL)
        ids = [item["id"] for item in response.json()]
        self.assertEqual(set(ids), {first_id, second_id})
        self.assertNotIn(user_b_id, ids)
        self.assertEqual(ids, [second_id, first_id])

    def test_empty_list(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        response = self.get_json(NETWORKS_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])


class NetworksUpdateDeleteTests(NetworksAPIBase):
    def test_patch_trained_becomes_draft(self):
        user, _ = self.create_user_pair()
        network_id = self.create_network(user)
        Network.objects.filter(pk=network_id).update(state=Network.State.TRAINED)

        self.auth = auth_headers(user)
        response = self.patch_json(f"{NETWORKS_URL}/{network_id}", {"name": "gamaltered"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["state"], "draft")
        Network.objects.filter(pk=network_id).update(state=Network.State.TRAINED)
        full = dict(API_VALID, name="otra")
        response = self.patch_json(f"{NETWORKS_URL}/{network_id}", full)
        self.assertEqual(response.json()["state"], "draft")

    def test_patch_contains_partial_fields_keeps_rest(self):
        user, _ = self.create_user_pair()
        network_id = self.create_network(user)
        self.auth = auth_headers(user)
        response = self.patch_json(f"{NETWORKS_URL}/{network_id}", {"name": "solo-nombre"})
        data = response.json()
        self.assertEqual(data["name"], "solo-nombre")
        self.assertEqual(data["epochs"], API_VALID["epochs"])
        self.assertEqual(data["loss"], "mse")

    def test_patch_training_locked(self):
        user, _ = self.create_user_pair()
        network_id = self.create_network(user)
        Network.objects.filter(pk=network_id).update(state=Network.State.TRAINING)
        self.auth = auth_headers(user)
        response = self.patch_json(f"{NETWORKS_URL}/{network_id}", {"name": "nueva"})
        self.assertEqual(response.status_code, 409)

    def test_patch_invalid_partial_branch(self):
        user, _ = self.create_user_pair()
        network_id = self.create_network(user)
        self.auth = auth_headers(user)
        response = self.patch_json(f"{NETWORKS_URL}/{network_id}", {"epochs": -3})
        self.assertEqual(response.status_code, 422)

    def test_delete_then_not_found(self):
        user, _ = self.create_user_pair()
        network_id = self.create_network(user)
        self.auth = auth_headers(user)
        response = self.delete_json(f"{NETWORKS_URL}/{network_id}")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.get_json(f"{NETWORKS_URL}/{network_id}").status_code, 404)

    def test_delete_training_locked(self):
        user, _ = self.create_user_pair()
        network_id = self.create_network(user)
        Network.objects.filter(pk=network_id).update(state=Network.State.TRAINING)
        self.auth = auth_headers(user)
        response = self.delete_json(f"{NETWORKS_URL}/{network_id}")
        self.assertEqual(response.status_code, 409)
        self.assertTrue(Network.objects.filter(pk=network_id).exists())

    def test_cross_user_equals_notfound(self):
        user_a, user_b = self.create_user_pair()
        network_id = self.create_network(user_a)

        self.auth = auth_headers(user_b)
        foreign = self.get_json(f"{NETWORKS_URL}/{network_id}")
        missing = self.get_json(f"{NETWORKS_URL}/99999999")
        self.assertEqual(foreign.status_code, 404)
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(foreign.content, missing.content)


class NetworksAuthTests(NetworksAPIBase):
    def test_all_require_auth(self):
        self.create_user_pair()
        cases = {
            "post": (NETWORKS_URL, API_VALID),
            "get": (f"{NETWORKS_URL}", None),
            "delete": (f"{NETWORKS_URL}/1", None),
        }
        for method, (url, body) in cases.items():
            self.auth = {}
            response = self.request(method, url, body)
            self.assertEqual(
                response.status_code, 401, f"{method} sin token no devolvió 401"
            )

    def test_get_detail_without_auth(self):
        user, _ = self.create_user_pair()
        network_id = self.create_network(user)
        self.auth = {}
        self.assertEqual(self.get_json(f"{NETWORKS_URL}/{network_id}").status_code, 401)

    def test_patch_without_auth(self):
        user, _ = self.create_user_pair()
        network_id = self.create_network(user)
        self.auth = {}
        response = self.patch_json(f"{NETWORKS_URL}/{network_id}", {"name": "x"})
        self.assertEqual(response.status_code, 401)
