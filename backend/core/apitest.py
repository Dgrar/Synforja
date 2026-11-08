import json
import uuid

from django.test import TestCase, override_settings

# Los tests no dependen de Redis: LocMemCache hermético por proceso.
LOC_CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# PBKDF2 tarda 0.7-6 s por hash según la carga: en tests, MD5.
TEST_HASHER = "django.contrib.auth.hashers.MD5PasswordHasher"


def rand_suffix() -> str:
    return uuid.uuid4().hex[:10]


def auth_headers(user) -> dict:
    from ninja_jwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {refresh.access_token}"}


@override_settings(CACHES=LOC_CACHES, PASSWORD_HASHERS=[TEST_HASHER])
class ApiTestBase(TestCase):
    """Base para tests de API: cache local, ip propia y helpers HTTP.

    Cada test tiene una ip única: el throttling global y los rate-limits de auth usan cache compartido, así cada test queda aislado de los demás.
    """

    def setUp(self):
        super().setUp()
        self.remote_ip = ".".join(
            (
                "10",
                str(uuid.uuid4().int & 0xFF),
                str((uuid.uuid4().int >> 8) & 0xFF),
                str((uuid.uuid4().int >> 16) & 0xFF),
            )
        )
        self.auth = {}

    def request(self, method: str, url: str, data: dict | None = None):
        extra = {"REMOTE_ADDR": self.remote_ip, **self.auth}
        payload = json.dumps(data) if data is not None else data
        return getattr(self.client, method.lower())(
            url,
            data=payload,
            content_type="application/json",
            **extra,
        )

    def post_json(self, url: str, data: dict):
        return self.request("post", url, data)

    def patch_json(self, url: str, data: dict):
        return self.request("patch", url, data)

    def delete_json(self, url: str):
        return self.request("delete", url)

    def get_json(self, url: str):
        return self.request("get", url)
