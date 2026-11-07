import json
import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

REGISTER_URL = "/api/users/register"
LOGIN_URL = "/api/users/login"

User = get_user_model()

# Los tests no dependen de Redis LocMemCache hermético por proceso.
LOC_CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


def rand_suffix() -> str:
    return uuid.uuid4().hex[:10]


def register_body(email_suffix: str) -> dict:
    return {
        "username": f"user_{email_suffix}",
        "email": f"user_{email_suffix}@example.com",
        "password": "xK9mQ2pLz1!",
    }


@override_settings(CACHES=LOC_CACHES)
class AuthAPITestsBase(TestCase):
    def setUp(self):
        super().setUp()
        # Creamos ip personalizada para cada test
        self.remote_ip = f"10.{uuid.uuid4().int & 0xFF}.{uuid.uuid4().int & 0xFF}.{uuid.uuid4().int & 0xFF}"

    def post_json(self, url: str, data: dict):
        return self.client.post(
            url,
            data=json.dumps(data),
            content_type="application/json",
            REMOTE_ADDR=self.remote_ip,
        )


class AuthRegisterTests(AuthAPITestsBase):
    def test_register_success_returns_token_pair(self):
        body = register_body(rand_suffix())
        response = self.post_json(REGISTER_URL, body)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access", data)
        self.assertIn("refresh", data)

    def test_register_creates_user(self):
        body = register_body(rand_suffix())
        self.post_json(REGISTER_URL, body)
        self.assertTrue(User.objects.filter(username=body["username"]).exists())

    def test_register_duplicate_username_case_insensitive(self):
        base = rand_suffix()
        first = dict(register_body(base), username="CaseUser")
        self.post_json(REGISTER_URL, first)
        second = dict(register_body(rand_suffix()), username="caseuser")
        response = self.post_json(REGISTER_URL, second)
        self.assertEqual(response.status_code, 409)

    def test_register_duplicate_email(self):
        base = rand_suffix()
        email = f"dup_{base}@example.com"
        first = dict(register_body(rand_suffix()), email=email)
        self.post_json(REGISTER_URL, first)
        second = dict(register_body(rand_suffix()), email=email)
        response = self.post_json(REGISTER_URL, second)
        self.assertEqual(response.status_code, 409)

    def test_register_invalid_email_rejected(self):
        body = dict(register_body(rand_suffix()), email="not-an-email")
        response = self.post_json(REGISTER_URL, body)
        self.assertEqual(response.status_code, 422)

    def test_register_rate_limit(self):
        email = f"limited_{rand_suffix()}@example.com"
        for _ in range(5):
            self.post_json(REGISTER_URL, dict(register_body(rand_suffix()), email=email))
        response = self.post_json(REGISTER_URL, dict(register_body(rand_suffix()), email=email))
        self.assertEqual(response.status_code, 429)
        self.assertIn("detail", response.json())


class AuthLoginTests(AuthAPITestsBase):
    def make_user(self, active: bool = True) -> dict:
        suffix = rand_suffix()
        username = f"login_{suffix}"
        password = "xK9mQ2pLz1!"
        user = User.objects.create_user(
            username=username, email=f"{username}@example.com", password=password
        )
        user.is_active = active
        user.save()
        return {"username": username, "email": f"{username}@example.com", "password": password}

    def test_login_by_username(self):
        creds = self.make_user()
        body = {"username_or_email": creds["username"], "password": creds["password"]}
        response = self.post_json(LOGIN_URL, body)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access_token", data)
        self.assertIn("refresh_token", data)

    def test_login_by_email(self):
        creds = self.make_user()
        body = {"username_or_email": creds["email"], "password": creds["password"]}
        response = self.post_json(LOGIN_URL, body)
        self.assertEqual(response.status_code, 200)

    def test_login_wrong_password(self):
        creds = self.make_user()
        body = {"username_or_email": creds["username"], "password": "wrong-password-1"}
        response = self.post_json(LOGIN_URL, body)
        self.assertEqual(response.status_code, 401)

    def test_login_user_enumeration_parity(self):
        creds = self.make_user()
        wrong_password = self.post_json(
            LOGIN_URL,
            {"username_or_email": creds["username"], "password": "fake-password-1"},
        )
        nonexistent = self.post_json(
            LOGIN_URL,
            {"username_or_email": f"nope_{rand_suffix()}", "password": "fake-password-1"},
        )
        self.assertEqual(wrong_password.status_code, nonexistent.status_code)
        self.assertEqual(wrong_password.json(), nonexistent.json())

    def test_login_inactive_user(self):
        creds = self.make_user(active=False)
        body = {"username_or_email": creds["username"], "password": creds["password"]}
        response = self.post_json(LOGIN_URL, body)
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("access_token", response.json())

    def test_login_rate_limit(self):
        creds = self.make_user()
        body = {"username_or_email": creds["username"], "password": "fake-password-1"}
        for _ in range(5):
            self.post_json(LOGIN_URL, body)
        response = self.post_json(LOGIN_URL, body)
        self.assertEqual(response.status_code, 429)
        self.assertIn("detail", response.json())
