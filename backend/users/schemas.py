from ninja import Schema
from pydantic import EmailStr, NonNegativeInt

class UserRegisterInSchema(Schema):
    username: str
    email:EmailStr
    password:str
    
class UserRegisterOutSchema(Schema):
    access: str
    refresh:str

class UserLoginInSchema(Schema):
    username_or_email: str
    password: str

class UserLoginOutSchema(Schema):
    refresh_token: str
    access_token:str