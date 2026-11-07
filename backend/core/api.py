from ninja import NinjaAPI
from ninja.throttling import AnonRateThrottle, AuthRateThrottle
from django.http import HttpRequest, JsonResponse

from users.auth import router as users_router
from networks.api import router as networks_router

api = NinjaAPI(title="api",version="1.0.0",throttle=[
        AnonRateThrottle("10/s"),    
        AuthRateThrottle("100/m"),   
    ])

api.add_router("/users", users_router)
api.add_router("/networks", networks_router)

@api.get("test")
def test(request: HttpRequest):
    return JsonResponse({"status": "OK"})