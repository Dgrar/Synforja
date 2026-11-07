from django.test import SimpleTestCase

from pydantic import ValidationError

from .schemas import DatasetCsvIn, DatasetJsonIn

VALID_CSV = {
    "name": "diabetes",
    "content": "1,2,3,4\n5,6,7,8\n",
    "input_cols": 3,
}

VALID_JSON = {
    "name": "xor",
    "content": '{"inputs": [[0, 0], [1, 1]], "expects": [[0], [1]]}',
}


class DatasetCsvSchemaTests(SimpleTestCase):
    def test_valid(self):
        ds = DatasetCsvIn(**VALID_CSV)
        self.assertEqual(ds.input_cols, 3)

    def test_input_cols_zero(self):
        with self.assertRaises(ValidationError):
            DatasetCsvIn(**dict(VALID_CSV, input_cols=0))

    def test_input_cols_negative(self):
        with self.assertRaises(ValidationError):
            DatasetCsvIn(**dict(VALID_CSV, input_cols=-1))

    def test_empty_content(self):
        with self.assertRaises(ValidationError):
            DatasetCsvIn(**dict(VALID_CSV, content=""))

    def test_name_too_long(self):
        with self.assertRaises(ValidationError):
            DatasetCsvIn(**dict(VALID_CSV, name="a" * 101))

    def test_name_required(self):
        payload = {k: v for k, v in VALID_CSV.items() if k != "name"}
        with self.assertRaises(ValidationError):
            DatasetCsvIn(**payload)


class DatasetJsonSchemaTests(SimpleTestCase):
    def test_valid(self):
        ds = DatasetJsonIn(**VALID_JSON)
        self.assertIn("inputs", ds.content)

    def test_empty_content(self):
        with self.assertRaises(ValidationError):
            DatasetJsonIn(**dict(VALID_JSON, content=""))

    def test_name_too_long(self):
        with self.assertRaises(ValidationError):
            DatasetJsonIn(**dict(VALID_JSON, name="a" * 101))
