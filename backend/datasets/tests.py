import json

from django.contrib.auth import get_user_model
from django.db.models import Model
from django.test import SimpleTestCase, override_settings

from pydantic import ValidationError

from core.apitest import ApiTestBase, auth_headers, rand_suffix
from .models import Dataset
from .schemas import DatasetIn
from .validation import Invalid, Limit, Ok, scan_csv, scan_json
from .validation import MAX_REPORT, Violation


TEST_JSON = {"inputs": [[0, 0], [1, 1]], "expects": [[0], [1]]}

API_CSV = {
    "source_type": "csv",
    "name": "diabetes",
    "content": "1,2,3\n4,5,6",
    "input_cols": 2,
}

API_JSON = {
    "source_type": "json",
    "name": "xor",
    "content": TEST_JSON,
}


class DatasetSchemaTests(SimpleTestCase):
    def test_valid_csv(self):
        payload = dict(API_CSV)
        parsed = DatasetIn(**payload)
        self.assertEqual(parsed.source_type, "csv")
        self.assertEqual(parsed.input_cols, 2)

    def test_valid_json(self):
        parsed = DatasetIn(**API_JSON)
        self.assertEqual(parsed.source_type, "json")

    def test_source_type_forbidden_value(self):
        with self.assertRaises(ValidationError):
            DatasetIn(**dict(API_CSV, source_type="xlsx"))

    def test_csv_without_input_cols(self):
        payload = {k: v for k, v in API_CSV.items() if k != "input_cols"}
        with self.assertRaises(ValidationError):
            DatasetIn(**payload)

    def test_json_rejects_input_cols(self):
        with self.assertRaises(ValidationError):
            DatasetIn(**dict(API_JSON, input_cols=2))

    def test_name_too_long(self):
        with self.assertRaises(ValidationError):
            DatasetIn(**dict(API_CSV, name="a" * 101))

    def test_name_required(self):
        payload = {k: v for k, v in API_CSV.items() if k != "name"}
        with self.assertRaises(ValidationError):
            DatasetIn(**payload)


class ScanCsvTests(SimpleTestCase):
    def test_ok_counts(self):
        outcome = scan_csv("1,2,3\n4,5,6", 2)
        self.assertEqual(outcome, Ok(rows=2, input_cols=2, output_cols=1))

    def test_empty(self):
        self.assertEqual(scan_csv("", 1), Limit(422, "El CSV está vacío o no contiene filas"))

    def test_blank_lines_only(self):
        self.assertTrue(isinstance(scan_csv("\n\n", 1), Limit))

    def test_content_not_string(self):
        self.assertTrue(isinstance(scan_csv(None, 1), Invalid))

    def test_size_limit(self):
        content = "0," * 2_621_441
        outcome = scan_csv(content, 1)
        self.assertTrue(isinstance(outcome, Limit))

    def test_row_limit(self):
        content = "\n".join(["1,2"] * 50_001)
        outcome = scan_csv(content, 1)
        self.assertTrue(isinstance(outcome, Limit))

    def test_input_cols_out_of_range(self):
        outcome = scan_csv("1,2,3\n", 3)
        self.assertTrue(isinstance(outcome, Limit))

    def test_non_numeric(self):
        outcome = scan_csv("1.5,x\n", 1)
        self.assertEqual(
            outcome,
            Invalid(entries=[Violation(row=1, col=2, reason="valor no numérico")], total=1),
        )

    def test_non_finite_nan_inf(self):
        outcome = scan_csv("nan,inf\n-1e999,0\n", 1)
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertEqual(outcome.total, 3)
        self.assertTrue(all(e.reason == "valor no finito" for e in outcome.entries))

    def test_ragged_row(self):
        outcome = scan_csv("1,2,3\n1,2\n", 1)
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertEqual(outcome.total, 1)
        self.assertEqual(outcome.entries[0].row, 2)
        self.assertEqual(outcome.entries[0].col, 0)

    def test_empty_row_inside_data(self):
        outcome = scan_csv("1,2\n\n3,4\n", 1)
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertEqual(outcome.entries[0].row, 2)
        self.assertEqual(outcome.entries[0].reason, "fila vacía")

    def test_two_columns_referenced(self):
        outcome = scan_csv("1,2\n3,4\n", 1)
        self.assertEqual(outcome, Ok(rows=2, input_cols=1, output_cols=1))

    def test_row_and_value_violations_accumulate(self):
        outcome = scan_csv("1,x\n2\n3,y\n", 1)
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertEqual(outcome.total, 3)

    def test_report_truncated_at_100(self):
        content = "".join(f"bad{index},{index}\n" for index in range(150))
        outcome = scan_csv(content, 1)
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertEqual(outcome.total, 150)
        self.assertEqual(len(outcome.entries), MAX_REPORT)
        self.assertEqual(outcome.entries[0].row, 1)


class ScanJsonTests(SimpleTestCase):
    def test_ok_counts(self):
        self.assertEqual(
            scan_json(TEST_JSON),
            Ok(rows=2, input_cols=2, output_cols=1),
        )

    def test_content_not_object(self):
        outcome = scan_json([1, 2])
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertEqual(outcome.total, 1)

    def test_missing_block(self):
        outcome = scan_json({"inputs": [[0, 0]]})
        self.assertEqual(outcome.total, 1)
        self.assertIn("falta", outcome.entries[0].reason)

    def test_extra_key(self):
        outcome = scan_json(dict(TEST_JSON, extra=[1]))
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertIn("admiten", outcome.entries[0].reason)

    def test_both_missing_counts_two(self):
        outcome = scan_json({})
        self.assertEqual(outcome.total, 2)

    def test_empty_collections(self):
        self.assertTrue(isinstance(scan_json({"inputs": [], "expects": []}), Limit))

    def test_row_limit(self):
        content = {"inputs": [[0]] * 50_001, "expects": [[0]] * 50_001}
        self.assertTrue(isinstance(scan_json(content), Limit))

    def test_size_limit(self):
        content = {"inputs": [["a" * 6_000_000]], "expects": [[0]]}
        self.assertTrue(isinstance(scan_json(content), Limit))

    def test_unbalanced_blocks(self):
        content = {"inputs": [[0, 0], [1, 1], [2, 2]], "expects": [[0], [1]]}
        outcome = scan_json(content)
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertTrue(any("distinto" in v.reason for v in outcome.entries))

    def test_ragged_row_first_dim(self):
        content = {"inputs": [[0, 0], [1]], "expects": [[0], [1]]}
        outcome = scan_json(content)
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertEqual(outcome.entries[0].row, 2)
        self.assertEqual(outcome.entries[0].col, 0)

    def test_non_number_element(self):
        content = {"inputs": [[0, "a"]], "expects": [[0]]}
        outcome = scan_json(content)
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertEqual(outcome.entries[0].col, 2)

    def test_boolean_rejected(self):
        content = {"inputs": [[0, True]], "expects": [[0]]}
        outcome = scan_json(content)
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertIn("no es un número", outcome.entries[0].reason)

    def test_non_finite_element(self):
        content = {"inputs": [[0, float("inf")]], "expects": [[0]]}
        outcome = scan_json(content)
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertIn("no es finito", outcome.entries[0].reason)

    def test_zero_width_vector(self):
        content = {"inputs": [[], []], "expects": [[0], [1]]}
        outcome = scan_json(content)
        self.assertTrue(isinstance(outcome, Invalid))
        self.assertIn("vacíos", outcome.entries[0].reason)


DATASETS_URL = "/api/datasets"


class DatasetsAPIBase(ApiTestBase):
    def create_user_pair(self):
        User = get_user_model()
        return (
            User.objects.create_user(username=f"a_{rand_suffix()}", password="xK9mQ2pLz1!"),
            User.objects.create_user(username=f"b_{rand_suffix()}", password="xK9mQ2pLz1!"),
        )

    def create_dataset(self, user, overrides: dict | None = None) -> dict:
        self.auth = auth_headers(user)
        overrides = overrides or {}
        base = API_JSON if overrides.get("source_type") == "json" else API_CSV
        payload = dict(base, **overrides)
        response = self.post_json(DATASETS_URL, payload)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()


class DatasetsCreateTests(DatasetsAPIBase):
    def test_create_csv_returns_stats(self):
        user, _ = self.create_user_pair()
        data = self.create_dataset(user)
        self.assertEqual(data["source_type"], "csv")
        self.assertEqual(data["total_rows"], 2)
        self.assertEqual(data["input_cols"], 2)
        self.assertEqual(data["output_cols"], 1)
        self.assertEqual(data["content_url"], f"{DATASETS_URL}/{data['id']}/content")
        dataset = Dataset.objects.get(pk=data["id"])
        self.assertEqual(dataset.content, API_CSV["content"])

    def test_create_json_returns_stats(self):
        user, _ = self.create_user_pair()
        data = self.create_dataset(user, {"source_type": "json", "content": TEST_JSON})
        self.assertEqual(data["total_rows"], 2)
        self.assertEqual(data["input_cols"], 2)
        self.assertEqual(data["output_cols"], 1)
        dataset = Dataset.objects.get(pk=data["id"])
        self.assertEqual(json.loads(dataset.content), TEST_JSON)

    def test_csv_violations_accumulate_and_do_not_persist(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        response = self.post_json(
            DATASETS_URL,
            dict(API_CSV, content="1,x\n1,2\nb,2\nc,2\n", input_cols=1),
        )
        self.assertEqual(response.status_code, 422)
        detail = response.json()["detail"]
        self.assertEqual(detail["total"], 3)
        self.assertEqual(len(detail["violations"]), 3)
        self.assertEqual(detail["violations"][0]["row"], 1)
        self.assertEqual(detail["violations"][0]["col"], 2)
        self.assertIn("no numérico", detail["violations"][0]["reason"])
        self.assertFalse(Dataset.objects.filter(user=user).exists())

    def test_json_shape_error_shape_and_no_persist(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        content = {"inputs": [[0, 0], [1, 1], [2, 2]], "expects": [[0], [1]]}
        response = self.post_json(DATASETS_URL, dict(API_JSON, content=content))
        self.assertEqual(response.status_code, 422)
        detail = response.json()["detail"]
        self.assertEqual(detail["total"], 1)
        self.assertFalse(Dataset.objects.filter(user=user).exists())

    def test_csv_over_size_limit_rejected_413(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        response = self.post_json(DATASETS_URL, dict(API_CSV, content="0," * 2_621_441))
        self.assertEqual(response.status_code, 413)
        self.assertFalse(Dataset.objects.filter(user=user).exists())

    def test_csv_too_many_rows_rejected(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        response = self.post_json(
            DATASETS_URL,
            dict(API_CSV, content="\n".join(["1,2"] * 50_001)),
        )
        self.assertEqual(response.status_code, 422)
        self.assertFalse(Dataset.objects.filter(user=user).exists())

    def test_json_too_many_rows_rejected(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        content = {"inputs": [[0]] * 50_001, "expects": [[0]] * 50_001}
        response = self.post_json(DATASETS_URL, dict(API_JSON, content=content))
        self.assertEqual(response.status_code, 422)
        self.assertFalse(Dataset.objects.filter(user=user).exists())

    def test_json_with_nan_rejected(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        content = {"inputs": [[0, float("nan")]], "expects": [[0]]}
        response = self.post_json(DATASETS_URL, dict(API_JSON, content=content))
        self.assertEqual(response.status_code, 422)
        detail = response.json()["detail"]
        self.assertIn("no es finito", detail["violations"][0]["reason"])

    def test_same_content_uploaded_twice_creates_two(self):
        user, _ = self.create_user_pair()
        first = self.create_dataset(user)
        second = self.create_dataset(user)
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(Dataset.objects.filter(user=user).count(), 2)


class DatasetsListDetailContentTests(DatasetsAPIBase):
    def test_list_only_own_desc_mixed_types(self):
        user_a, user_b = self.create_user_pair()
        csv_id = self.create_dataset(user_a)["id"]
        json_id = self.create_dataset(user_a, {"source_type": "json", "content": TEST_JSON})["id"]
        user_b_id = self.create_dataset(user_b)["id"]

        self.auth = auth_headers(user_a)
        response = self.get_json(DATASETS_URL)
        items = response.json()
        self.assertEqual([i["id"] for i in items], [json_id, csv_id])
        self.assertNotIn(user_b_id, [i["id"] for i in items])
        self.assertEqual(items[0]["source_type"], "json")

    def test_empty_list(self):
        user, _ = self.create_user_pair()
        self.auth = auth_headers(user)
        response = self.get_json(DATASETS_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_detail_returns_stats(self):
        user, _ = self.create_user_pair()
        dataset_id = self.create_dataset(user)["id"]
        self.auth = auth_headers(user)
        response = self.get_json(f"{DATASETS_URL}/{dataset_id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["input_cols"], 2)
        self.assertEqual(data["content_url"], f"{DATASETS_URL}/{dataset_id}/content")

    def test_content_returns_raw_csv(self):
        user, _ = self.create_user_pair()
        dataset_id = self.create_dataset(user)["id"]
        self.auth = auth_headers(user)
        response = self.get_json(f"{DATASETS_URL}/{dataset_id}/content")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["content"], API_CSV["content"])
        self.assertEqual(data["source_type"], "csv")

    def test_content_returns_stored_json_string(self):
        user, _ = self.create_user_pair()
        dataset_id = self.create_dataset(user, {"source_type": "json", "content": TEST_JSON})["id"]
        self.auth = auth_headers(user)
        response = self.get_json(f"{DATASETS_URL}/{dataset_id}/content")
        self.assertEqual(json.loads(response.json()["content"]), TEST_JSON)

    def test_cross_user_equals_notfound(self):
        user_a, user_b = self.create_user_pair()
        dataset_id = self.create_dataset(user_a)["id"]

        self.auth = auth_headers(user_b)
        foreign = self.get_json(f"{DATASETS_URL}/{dataset_id}")
        missing = self.get_json(f"{DATASETS_URL}/99999999")
        foreign_content = self.get_json(f"{DATASETS_URL}/{dataset_id}/content")
        missing_content = self.get_json(f"{DATASETS_URL}/99999999/content")
        self.assertEqual(foreign.status_code, 404)
        self.assertEqual(foreign.content, missing.content)
        self.assertEqual(foreign_content.status_code, 404)
        self.assertEqual(foreign_content.content, missing_content.content)


class DatasetsDeleteTests(DatasetsAPIBase):
    def test_delete_then_not_found(self):
        user, _ = self.create_user_pair()
        dataset_id = self.create_dataset(user)["id"]
        self.auth = auth_headers(user)
        self.assertEqual(self.delete_json(f"{DATASETS_URL}/{dataset_id}").status_code, 204)
        self.assertEqual(self.get_json(f"{DATASETS_URL}/{dataset_id}").status_code, 404)
        self.assertEqual(
            self.get_json(f"{DATASETS_URL}/{dataset_id}/content").status_code, 404
        )

    def test_delete_leaves_networks_alone(self):
        user, _ = self.create_user_pair()
        dataset_id = self.create_dataset(user)["id"]
        self.auth = auth_headers(user)
        self.delete_json(f"{DATASETS_URL}/{dataset_id}")
        self.assertFalse(Dataset.objects.filter(pk=dataset_id).exists())


class DatasetsAuthTests(DatasetsAPIBase):
    def test_all_require_auth(self):
        self.create_user_pair()
        detail_id = 1
        cases = (
            ("post", DATASETS_URL, API_CSV),
            ("get", DATASETS_URL, None),
            ("get", f"{DATASETS_URL}/{detail_id}", None),
            ("get", f"{DATASETS_URL}/{detail_id}/content", None),
            ("delete", f"{DATASETS_URL}/{detail_id}", None),
        )
        for method, url, body in cases:
            self.auth = {}
            response = self.request(method, url, body)
            self.assertEqual(
                response.status_code, 401, f"{method} sin token no devolvió 401"
            )
