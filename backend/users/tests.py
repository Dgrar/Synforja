import uuid

from django.contrib.auth import get_user_model
from django.test import override_settings

from core.apitest import ApiTestBase, auth_headers
from networks.models import Network
from users.auth import ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE

REGISTER_URL = "/api/users/register"
LOGIN_URL = "/api/users/login"
REFRESH_URL = "/api/users/refresh"
LOGOUT_URL = "/api/users/logout"
CSRF_URL = "/api/users/csrf"
ME_URL = "/api/users/me"

User = get_user_model()


def rand_suffix() -> str:
    return uuid.uuid4().hex[:10]


def register_body(email_suffix: str) -> dict:
    return {
        "username": f"user_{email_suffix}",
        "email": f"user_{email_suffix}@example.com",
        "password": "xK9mQ2pLz1!",
    }


def network_body(name: str = "cookie-net") -> dict:
    return {
        "name": name,
        "layers": [
            {"size": 1, "activation": "relu"},
            {"size": 1, "activation": "linear"},
        ],
        "epochs": 1,
        "learning_rate": 0.1,
        "loss": "mse",
        "training_split": 0.8,
    }


class AuthAPITestsBase(ApiTestBase):
    """Hereda cache local, ip única por test y helpers HTTP de core.apitest."""

    def setUp(self):
        super().setUp()
        self.auth = self.csrf_headers()

    def make_user(self, active: bool = True) -> dict:
        suffix = rand_suffix()
        username = f"login_{suffix}"
        password = "xK9mQ2pLz1!"
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password=password,
        )
        user.is_active = active
        user.save()
        return {
            "username": username,
            "email": f"{username}@example.com",
            "password": password,
        }


class AuthRegisterTests(AuthAPITestsBase):
    def test_register_success_returns_user_and_cookies(self):
        body = register_body(rand_suffix())
        response = self.post_json(REGISTER_URL, body)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(set(data), {"id", "username", "email"})
        self.assertEqual(data["username"], body["username"])
        self.assertNotIn("access", data)
        self.assertNotIn("refresh", data)

        access = response.cookies[ACCESS_COOKIE]
        refresh = response.cookies[REFRESH_COOKIE]
        self.assertTrue(access["httponly"])
        self.assertTrue(refresh["httponly"])
        self.assertEqual(access["path"], "/api")
        self.assertEqual(refresh["path"], "/api/users/refresh")
        self.assertEqual(access["samesite"], "Lax")

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

    def test_register_requires_csrf(self):
        self.auth = {}
        response = self.post_json(REGISTER_URL, register_body(rand_suffix()))
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username=register_body("x")["username"]).exists())


class AuthLoginTests(AuthAPITestsBase):
    def test_login_by_username_sets_cookies(self):
        creds = self.make_user()
        body = {"username_or_email": creds["username"], "password": creds["password"]}
        response = self.post_json(LOGIN_URL, body)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(set(data), {"id", "username", "email"})
        self.assertNotIn("access_token", data)
        self.assertNotIn("refresh_token", data)
        self.assertIn(ACCESS_COOKIE, response.cookies)
        self.assertIn(REFRESH_COOKIE, response.cookies)

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
        self.assertNotIn(ACCESS_COOKIE, response.cookies)

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
        self.assertNotIn(ACCESS_COOKIE, response.cookies)

    def test_login_rate_limit(self):
        creds = self.make_user()
        body = {"username_or_email": creds["username"], "password": "fake-password-1"}
        for _ in range(5):
            self.post_json(LOGIN_URL, body)
        response = self.post_json(LOGIN_URL, body)
        self.assertEqual(response.status_code, 429)
        self.assertIn("detail", response.json())

    def test_login_requires_csrf(self):
        creds = self.make_user()
        self.auth = {}
        response = self.post_json(
            LOGIN_URL,
            {"username_or_email": creds["username"], "password": creds["password"]},
        )
        self.assertEqual(response.status_code, 403)
        self.assertNotIn(ACCESS_COOKIE, response.cookies)


class CookieSessionTests(AuthAPITestsBase):
    def setUp(self):
        super().setUp()
        self.creds = self.make_user()

    def login(self):
        return self.post_json(
            LOGIN_URL,
            {
                "username_or_email": self.creds["username"],
                "password": self.creds["password"],
            },
        )

    def test_me_with_cookie(self):
        self.login()
        response = self.get_json(ME_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], self.creds["username"])

    def test_me_without_cookie_is_401(self):
        self.client.cookies.clear()
        response = self.get_json(ME_URL)
        self.assertEqual(response.status_code, 401)

    def test_me_with_bearer_still_works(self):
        user = User.objects.get(username=self.creds["username"])
        self.auth = auth_headers(user)
        response = self.get_json(ME_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], self.creds["username"])

    def test_cookie_auth_allows_private_read(self):
        self.login()
        response = self.get_json("/api/networks")
        self.assertEqual(response.status_code, 200)

    def test_cookie_write_requires_csrf(self):
        self.login()
        self.auth = {}
        response = self.post_json("/api/networks", network_body())
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Network.objects.count(), 0)

    def test_cookie_write_with_csrf(self):
        self.login()
        response = self.post_json("/api/networks", network_body())
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Network.objects.count(), 1)

    def test_cookie_write_with_wrong_csrf(self):
        self.login()
        self.auth = {"HTTP_X_CSRFTOKEN": "wrong-token"}
        response = self.post_json("/api/networks", network_body())
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Network.objects.count(), 0)

    def test_refresh_returns_access_cookie_without_tokens(self):
        self.login()
        response = self.request("post", REFRESH_URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn(ACCESS_COOKIE, response.cookies)
        self.assertEqual(set(response.json()), {"detail"})

    def test_refresh_requires_csrf(self):
        self.login()
        self.auth = {}
        response = self.request("post", REFRESH_URL)
        self.assertEqual(response.status_code, 403)

    def test_refresh_invalid_clears_cookies(self):
        self.login()
        self.client.cookies[REFRESH_COOKIE] = "not-a-refresh-token"
        response = self.request("post", REFRESH_URL)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.cookies[ACCESS_COOKIE]["max-age"], 0)
        self.assertEqual(response.cookies[REFRESH_COOKIE]["max-age"], 0)
        self.assertEqual(response.cookies[CSRF_COOKIE]["max-age"], 0)

    def test_logout_clears_cookies_and_session(self):
        self.login()
        response = self.request("post", LOGOUT_URL)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.cookies[ACCESS_COOKIE]["max-age"], 0)
        self.assertEqual(response.cookies[REFRESH_COOKIE]["max-age"], 0)
        self.assertEqual(response.cookies[CSRF_COOKIE]["max-age"], 0)
        self.assertEqual(self.get_json(ME_URL).status_code, 401)

    def test_logout_requires_csrf(self):
        self.login()
        self.auth = {}
        response = self.request("post", LOGOUT_URL)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.get_json(ME_URL).status_code, 200)

    def test_csrf_endpoint_sets_httponly_cookie(self):
        response = self.client.get(CSRF_URL, REMOTE_ADDR=self.remote_ip)
        self.assertEqual(response.status_code, 200)
        token = response.json()["csrf_token"]
        cookie = response.cookies[CSRF_COOKIE]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/")
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(cookie.value, token)

    def test_cors_allows_credentials_for_frontend_origin(self):
        response = self.client.get(
            CSRF_URL,
            REMOTE_ADDR=self.remote_ip,
            HTTP_ORIGIN="http://localhost:3000",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Access-Control-Allow-Origin"], "http://localhost:3000"
        )
        self.assertEqual(response["Access-Control-Allow-Credentials"], "true")

    def test_cors_preflight_allows_csrf_header(self):
        response = self.client.options(
            LOGIN_URL,
            REMOTE_ADDR=self.remote_ip,
            HTTP_ORIGIN="http://localhost:3000",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="x-csrftoken",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Access-Control-Allow-Origin"], "http://localhost:3000"
        )
        self.assertIn("x-csrftoken", response["Access-Control-Allow-Headers"].lower())

    @override_settings(AUTH_COOKIE_SECURE=True)
    def test_login_cookies_can_be_secure(self):
        self.login()
        response = self.login()
        self.assertTrue(response.cookies[ACCESS_COOKIE]["secure"])
        self.assertTrue(response.cookies[REFRESH_COOKIE]["secure"])
