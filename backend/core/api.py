from ninja import NinjaAPI
from django.http import HttpRequest, JsonResponse

api = NinjaAPI(title="api",version="1.0.0")

@api.get("test")
def test(request: HttpRequest):
    return JsonResponse({"status": "OK"})