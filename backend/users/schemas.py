from ninja import Schema
from pydantic import EmailStr

class UserRegisterInSchema(Schema):
    username: str
    email: EmailStr
    password: str

class UserLoginInSchema(Schema):
    username_or_email: str
    password: str

class UserPublicOutSchema(Schema):
    id: int
    username: str
    email: str

class CsrfOutSchema(Schema):
    csrf_token: str

class DetailOutSchema(Schema):
    detail: str