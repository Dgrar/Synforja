from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.http import HttpRequest, JsonResponse
from ninja import Router
from ninja_jwt.authentication import JWTAuth
from .schemas import UserRegisterInSchema, UserRegisterOutSchema


router = Router()

User = get_user_model()

@router.post("/register", response={201:UserRegisterOutSchema, 409:JsonResponse})
def register(request, payload:UserRegisterInSchema):
    if User.objects.filter(username=payload.username).exists or User.objects.filter(email=payload.email):
        return 409, "Ya existe un usuario con ese nombre o correo electrónico"
    
    new_user = User.objects.create_user(payload.username, payload.email, payload.password)
    
    return 201, {new_user}