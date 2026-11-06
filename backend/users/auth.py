from django.contrib.auth import get_user_model
from django.http import HttpRequest
from django.db.models import Q
from django.core.cache import cache
from core.settings import DEFAULT_PROTECTED_RATE_LIMIT
from ninja.errors import HttpError
from ninja import Router
from ninja_jwt.tokens import RefreshToken
from .schemas import UserRegisterInSchema, UserRegisterOutSchema, UserLoginOutSchema, UserLoginInSchema

router = Router()
User = get_user_model()

def generate_tokens(user) -> dict:
    refresh = RefreshToken.for_user(user)
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }

def get_client_ip(request: HttpRequest) -> str:
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '')

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

@router.post("/register", response=UserRegisterOutSchema)
def register(request: HttpRequest, payload: UserRegisterInSchema):
    ip = get_client_ip(request)
    key = f"rate_limit_reg_{ip}_{payload.email.lower()}"
    
    if check_if_limited(key):
        raise HttpError(429, "Demasiados intentos. Por favor, inténtelo más tarde.")
    
    if User.objects.filter(Q(username__iexact=payload.username) | Q(email__iexact=payload.email)).exists():
        raise HttpError(409, "Ya existe un usuario con ese correo o nombre de usuario")
    
    new_user = User.objects.create_user(
        username=payload.username, 
        email=payload.email, 
        password=payload.password
    )
    
    tokens = generate_tokens(new_user)
    return {
        "refresh": tokens["refresh"],
        "access": tokens["access"],
    }

@router.post("/login", response=UserLoginOutSchema)
def login(request: HttpRequest, payload: UserLoginInSchema):
    ip = get_client_ip(request)
    identifier = payload.username_or_email.lower()
    key = f"rate_limit_login_{ip}_{identifier}"
    
    if check_if_limited(key):
        raise HttpError(429, "Demasiados intentos. Por favor, inténtelo más tarde.")
    
    try:
        user = User.objects.get(Q(username__iexact=identifier) | Q(email__iexact=identifier))
        valid_password = user.check_password(payload.password)
    except User.DoesNotExist:
        # Se finje que se comprueba la contraseña para que el atacante no sepa si el usuario existe
        User().set_password(payload.password)
        valid_password = False
        user = None

    if not valid_password or user is None:
        raise HttpError(401, "Credenciales erróneas")
        
    if not user.is_active:
        raise HttpError(401, "Usuario no activo")
        
    tokens = generate_tokens(user)
    return {
        "refresh_token": tokens["refresh"],
        "access_token": tokens["access"],
    }
