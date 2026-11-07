from django.http import HttpRequest

from ninja import Router
from ninja.errors import HttpError
from ninja_jwt.authentication import JWTAuth

from .models import Network
from .schemas import NetworkIn, NetworkOut, NetworkPatchIn
from .seed import generate_seed

router = Router(auth=JWTAuth())


def as_out(network: Network) -> NetworkOut:
    return NetworkOut(
        id=network.id,
        name=network.name,
        type=network.type,
        state=network.state,
        layers=[dict(layer) for layer in network.layers],
        epochs=network.epochs,
        learning_rate=network.learning_rate,
        loss=network.loss,
        training_split=network.training_split,
        seed=network.seed,
    )


def get_own_or_404(user, network_id: int) -> Network:
    try:
        return Network.objects.get(pk=network_id, user=user)
    except (Network.DoesNotExist, ValueError):
        raise HttpError(404, "Recurso no encontrado")


@router.post("", response={201: NetworkOut})
def create_network(request: HttpRequest, payload: NetworkIn):
    seed = payload.seed if payload.seed is not None else generate_seed()
    network = Network.objects.create(
        user=request.auth,
        name=payload.name,
        state=Network.State.DRAFT,
        layers=[dict(layer) for layer in payload.layers],
        epochs=payload.epochs,
        learning_rate=payload.learning_rate,
        loss=payload.loss,
        training_split=payload.training_split,
        seed=seed,
    )
    return as_out(network)


@router.get("", response=list[NetworkOut])
def list_networks(request: HttpRequest):
    networks = Network.objects.filter(user=request.auth)
    return [as_out(n) for n in networks]


@router.get("/{network_id}", response=NetworkOut)
def get_network(request: HttpRequest, network_id: int):
    network = get_own_or_404(request.auth, network_id)
    return as_out(network)


@router.patch("/{network_id}", response=NetworkOut)
def update_network(request: HttpRequest, network_id: int, payload: NetworkPatchIn):
    network = get_own_or_404(request.auth, network_id)
    if network.state == Network.State.TRAINING:
        raise HttpError(409, "La red está en entrenamiento y no puede editarse")

    merged = {
        "name": network.name,
        "layers": network.layers,
        "epochs": network.epochs,
        "learning_rate": network.learning_rate,
        "loss": network.loss,
        "training_split": network.training_split,
        "seed": network.seed,
    }
    incoming = {
        field: getattr(payload, field)
        for field in merged
        if getattr(payload, field) is not None
    }
    merged.update(incoming)
    validated = NetworkIn(**merged)

    network.name = validated.name
    network.layers = [dict(layer) for layer in validated.layers]
    network.epochs = validated.epochs
    network.learning_rate = validated.learning_rate
    network.loss = validated.loss
    network.training_split = validated.training_split
    network.seed = validated.seed
    network.state = Network.State.DRAFT
    network.save()
    return as_out(network)


@router.delete("/{network_id}", response={204: None})
def delete_network(request: HttpRequest, network_id: int):
    network = get_own_or_404(request.auth, network_id)
    if network.state == Network.State.TRAINING:
        raise HttpError(409, "La red está en entrenamiento y no puede borrarse")
    network.delete()
    return 204, None
