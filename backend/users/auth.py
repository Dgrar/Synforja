import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Q
from django.http import HttpRequest, HttpResponse, JsonResponse
from ninja import Router
from ninja.errors import HttpError
from ninja_jwt.authentication import JWTAuth
from ninja_jwt.exceptions import TokenError
from ninja_jwt.tokens import RefreshToken

from core.settings import DEFAULT_PROTECTED_RATE_LIMIT

from .schemas import (
    CsrfOutSchema,
    DetailOutSchema,
    UserLoginInSchema,
    UserPublicOutSchema,
    UserRegisterInSchema,
)

router = Router()
User = get_user_model()

ACCESS_COOKIE = "synforja_access"
REFRESH_COOKIE = "synforja_refresh"
CSRF_COOKIE = "synforja_csrf"
CSRF_HEADER = "X-CSRFToken"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})


def _cookie_options() -> dict:
    return {
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
    }


def _max_age(name: str) -> int:
    return int(settings.NINJA_JWT[name].total_seconds())


def set_access_cookie(response: HttpResponse, token: str) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        token,
        max_age=_max_age("ACCESS_TOKEN_LIFETIME"),
        httponly=True,
        path="/api",
        **_cookie_options(),
    )


def set_refresh_cookie(response: HttpResponse, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=_max_age("REFRESH_TOKEN_LIFETIME"),
        httponly=True,
        path="/api/users/refresh",
        **_cookie_options(),
    )


def set_csrf_cookie(response: HttpResponse, token: str) -> None:
    response.set_cookie(
        CSRF_COOKIE,
        token,
        max_age=_max_age("REFRESH_TOKEN_LIFETIME"),
        httponly=True,
        path="/",
        **_cookie_options(),
    )


def clear_session_cookies(response: HttpResponse) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/api")
    response.delete_cookie(REFRESH_COOKIE, path="/api/users/refresh")
    response.delete_cookie(CSRF_COOKIE, path="/")


def ensure_csrf_cookie(request: HttpRequest, response: HttpResponse) -> str:
    token = request.COOKIES.get(CSRF_COOKIE)
    if not token:
        token = secrets.token_urlsafe(32)
    set_csrf_cookie(response, token)
    return token


def validate_csrf(request: HttpRequest) -> None:
    cookie = request.COOKIES.get(CSRF_COOKIE, "")
    header = request.headers.get(CSRF_HEADER, "")
    if not cookie or not header:
        raise HttpError(403, "Token CSRF inválido")
    if not secrets.compare_digest(cookie.encode(), header.encode()):
        raise HttpError(403, "Token CSRF inválido")


class CookieJWTAuth(JWTAuth):
    """JWT por cookie HttpOnly para el navegador; Bearer se conserva para tests."""

    def __call__(self, request: HttpRequest):
        user = super().__call__(request)
        if user is not None:
            return user

        token = request.COOKIES.get(ACCESS_COOKIE)
        if not token:
            return None

        user = self.jwt_authenticate(request, token)
        if request.method not in SAFE_METHODS:
            validate_csrf(request)
        return user


def user_payload(user) -> dict:
    return {"id": user.id, "username": user.username, "email": user.email}


def issue_session(response: HttpResponse, user) -> None:
    refresh = RefreshToken.for_user(user)
    set_access_cookie(response, str(refresh.access_token))
    set_refresh_cookie(response, str(refresh))


def expired_session_response() -> JsonResponse:
    response = JsonResponse({"detail": "Sesión caducada o inválida"}, status=401)
    clear_session_cookies(response)
    response["Cache-Control"] = "no-store"
    return response


def no_store(response: HttpResponse) -> None:
    response["Cache-Control"] = "no-store"


def get_client_ip(request: HttpRequest) -> str:
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def check_if_limited(key: str) -> bool:
    limit_time = DEFAULT_PROTECTED_RATE_LIMIT["TRIES_LIMIT_TIME"]
    limit_amount = DEFAULT_PROTECTED_RATE_LIMIT["TRIES_LIMIT_AMOUNT"]

    try:
        current_tries = cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=int(limit_time.total_seconds()))
        current_tries = 1

    if current_tries > limit_amount:
        return True

    return False


@router.get("/csrf", response=CsrfOutSchema)
def csrf(request: HttpRequest, response: HttpResponse):
    token = ensure_csrf_cookie(request, response)
    no_store(response)
    return {"csrf_token": token}


@router.get("/me", auth=CookieJWTAuth(), response=UserPublicOutSchema)
def me(request: HttpRequest, response: HttpResponse):
    no_store(response)
    return user_payload(request.auth)


@router.post("/register", response=UserPublicOutSchema)
def register(request: HttpRequest, payload: UserRegisterInSchema, response: HttpResponse):
    validate_csrf(request)

    ip = get_client_ip(request)
    key = f"rate_limit_reg_{ip}_{payload.email.lower()}"

    if check_if_limited(key):
        raise HttpError(429, "Demasiados intentos. Por favor, inténtelo más tarde.")

    if User.objects.filter(
        Q(username__iexact=payload.username) | Q(email__iexact=payload.email)
    ).exists():
        raise HttpError(409, "Ya existe un usuario con ese correo o nombre de usuario")

    new_user = User.objects.create_user(
        username=payload.username,
        email=payload.email,
        password=payload.password,
    )

    issue_session(response, new_user)
    no_store(response)
    return user_payload(new_user)


@router.post("/login", response=UserPublicOutSchema)
def login(request: HttpRequest, payload: UserLoginInSchema, response: HttpResponse):
    validate_csrf(request)

    ip = get_client_ip(request)
    identifier = payload.username_or_email.lower()
    key = f"rate_limit_login_{ip}_{identifier}"

    if check_if_limited(key):
        raise HttpError(429, "Demasiados intentos. Por favor, inténtelo más tarde.")

    try:
        user = User.objects.get(Q(username__iexact=identifier) | Q(email__iexact=identifier))
        valid_password = user.check_password(payload.password)
    except User.DoesNotExist:
        # Se finge que se comprueba la contraseña para que el atacante no sepa si el usuario existe
        User().set_password(payload.password)
        valid_password = False
        user = None

    if not valid_password or user is None:
        raise HttpError(401, "Credenciales erróneas")

    if not user.is_active:
        raise HttpError(401, "Usuario no activo")

    issue_session(response, user)
    no_store(response)
    return user_payload(user)


@router.post("/refresh", response=DetailOutSchema)
def refresh(request: HttpRequest, response: HttpResponse):
    validate_csrf(request)

    raw_token = request.COOKIES.get(REFRESH_COOKIE)
    if not raw_token:
        return expired_session_response()

    try:
        refresh_token = RefreshToken(raw_token)
    except TokenError:
        return expired_session_response()

    user_id = refresh_token.payload.get("user_id")
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        return expired_session_response()

    set_access_cookie(response, str(refresh_token.access_token))
    no_store(response)
    return {"detail": "ok"}


@router.post("/logout")
def logout(request: HttpRequest, response: HttpResponse):
    validate_csrf(request)
    clear_session_cookies(response)
    response.status_code = 204
    no_store(response)
    return response
