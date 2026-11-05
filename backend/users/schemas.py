from ninja import Schema
from pydantic import EmailStr, NonNegativeInt

class UserRegisterInSchema(Schema):
    username: str
    email:EmailStr
    password:str
    
class UserRegisterOutSchema(Schema):
    id: NonNegativeInt
    username:str
    email:str