import json
import math

import engine_core
from asgiref.sync import sync_to_async
from django.http import HttpRequest, JsonResponse

from ninja import Router
from ninja.errors import HttpError
from ninja_jwt.authentication import JWTAuth

from datasets.models import Dataset

from .engine import (
    MAX_DUMP_BYTES,
    build_model_config,
    engine_error_status,
    estimate_dump_bytes,
    parse_engine_error,
)
from .models import Network
from .schemas import (
    NetworkIn,
    NetworkOut,
    NetworkPatchIn,
    PredictIn,
    PredictOut,
    RunOut,
    TrainIn,
)
from .seed import generate_seed
from .service import (
    as_run_out,
    mark_training,
    persist_outcome,
    reset_after_failure,
)
from .streaming import stream_train_response, wants_stream

router = Router(auth=JWTAuth())

MAX_TRAIN_EPOCHS = 10_000
MAX_TRAIN_LR = 1.0
MAX_TRAIN_STEPS = 5_000_000


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


def get_own_dataset_or_404(user, dataset_id: int) -> Dataset:
    try:
        return Dataset.objects.get(pk=dataset_id, user=user)
    except (Dataset.DoesNotExist, ValueError):
        raise HttpError(404, "Recurso no encontrado")

# Comprueba que la forma es correcta
def ensure_trainable_shape(network: Network, dataset: Dataset) -> None:
    first = network.layers[0]["size"]
    last = network.layers[-1]["size"]
    if first != dataset.input_cols or last != dataset.output_cols:
        raise HttpError(
            422,
            f"La red espera {first} entradas y {last} salidas, "
            f"el dataset tiene {dataset.input_cols} entradas y {dataset.output_cols} salidas",
        )

# Comprueba que el precio para entrenar al modelo no es demasiado
def ensure_trainable_cost(network: Network, dataset: Dataset) -> None:
    if network.epochs > MAX_TRAIN_EPOCHS:
        raise HttpError(422, f"epochs no puede superar {MAX_TRAIN_EPOCHS}")
    if network.learning_rate > MAX_TRAIN_LR:
        raise HttpError(422, "learning_rate no puede superar 1")
    if network.epochs * dataset.total_rows > MAX_TRAIN_STEPS:
        raise HttpError(
            422, "El presupuesto de entrenamiento (epochs × filas) supera 5 000 000"
        )

# Funcion para asegurarnos de devolver el modelo a su estado inicial tras un fallo
# La funcion que se encarga de hacer que el engine funcione
def run_engine(network: Network, dataset: Dataset) -> dict:
    config = build_model_config(network)
    if dataset.source_type == Dataset.SourceType.CSV:
        outcome = engine_core.train_csv(config, dataset.content, dataset.input_cols)
    else:
        outcome = engine_core.train_json(config, dataset.content)
    return json.loads(outcome)


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

    was_trained = network.state == Network.State.TRAINED

    network.name = validated.name
    network.layers = [dict(layer) for layer in validated.layers]
    network.epochs = validated.epochs
    network.learning_rate = validated.learning_rate
    network.loss = validated.loss
    network.training_split = validated.training_split
    network.seed = validated.seed
    network.state = Network.State.DRAFT
    if was_trained:
        network.weights = None
    network.save()
    return as_out(network)


@router.delete("/{network_id}", response={204: None})
def delete_network(request: HttpRequest, network_id: int):
    network = get_own_or_404(request.auth, network_id)
    if network.state == Network.State.TRAINING:
        raise HttpError(409, "La red está en entrenamiento y no puede borrarse")
    network.delete()
    return 204, None

# Valida una petición de entrenamiento para ambas modalidades
def _validate_train_request(user, network_id: int, dataset_id: int) -> tuple[Network, Dataset]:
    network = get_own_or_404(user, network_id)
    dataset = get_own_dataset_or_404(user, dataset_id)
    if network.state == Network.State.TRAINING:
        raise HttpError(409, "Ya hay un entrenamiento en curso para esta red")
    ensure_trainable_shape(network, dataset)
    ensure_trainable_cost(network, dataset)
    return network, dataset

# Endpoint para entrenar y streamear
@router.post("/{network_id}/train", response={201: RunOut})
async def train_network(request: HttpRequest, network_id: int, payload: TrainIn):
    network, dataset = await sync_to_async(
        _validate_train_request, thread_sensitive=True
    )(request.auth, network_id, payload.dataset_id)
    previous_state = network.state
    previous_weights = network.weights
    await sync_to_async(mark_training, thread_sensitive=True)(network)

    if wants_stream(request):
        return stream_train_response(network, dataset, previous_state, previous_weights)

    # Intentamos entrenar
    try:
        outcome = await sync_to_async(run_engine, thread_sensitive=False)(network, dataset)
    except ValueError as error:
        # Si hay algun error: Parseamos, reseteamos y devolvemos error
        code, detail = parse_engine_error(str(error))
        await sync_to_async(reset_after_failure, thread_sensitive=True)(network)
        raise HttpError(engine_error_status(code), detail)
    except Exception:
        # Si pasa otra cosa, reseteamos sin más
        await sync_to_async(reset_after_failure, thread_sensitive=True)(network)
        raise

    run = await sync_to_async(persist_outcome, thread_sensitive=True)(
        network, dataset, outcome
    )
    # Devolvemos la run
    return as_run_out(run)

# Para acceder a las runs
@router.get("/{network_id}/runs", response=list[RunOut])
def list_runs(request: HttpRequest, network_id: int):
    network = get_own_or_404(request.auth, network_id)
    return [as_run_out(run) for run in network.runs.all()]

# Para hacer que el modelo haga una prediccion ya entrenado
@router.post("/{network_id}/predict", response={200: PredictOut})
def predict(request: HttpRequest, network_id: int, payload: PredictIn):
    network = get_own_or_404(request.auth, network_id)
    if network.state != Network.State.TRAINED or network.weights is None:
        raise HttpError(409, "La red no está entrenada")

    expected = network.layers[0]["size"]
    if len(payload.input) != expected:
        raise HttpError(422, f"El vector de entrada debe tener {expected} valores")
    if not all(math.isfinite(value) for value in payload.input):
        raise HttpError(422, "El vector de entrada contiene valores no finitos")

    try:
        output = engine_core.predict_json(json.dumps(network.weights), payload.input)
    except ValueError as error:
        code, detail = parse_engine_error(str(error))
        raise HttpError(engine_error_status(code), detail)

    return PredictOut(output=output)

# Para obtener las weights de un modelo entrenado
@router.get("/{network_id}/weights")
def get_weights(request: HttpRequest, network_id: int):
    network = get_own_or_404(request.auth, network_id)
    if network.state != Network.State.TRAINED or network.weights is None:
        raise HttpError(409, "La red no está entrenada")

    if estimate_dump_bytes(network.layers) > MAX_DUMP_BYTES:
        raise HttpError(413, "El volcado de pesos supera el límite de 50 MB")

    payload = {
        "config": {
            "layers": [dict(layer) for layer in network.layers],
            "epochs": network.epochs,
            "learning_rate": network.learning_rate,
            "loss": network.loss,
            "training_split": network.training_split,
            "seed": network.seed,
        },
        "network": network.weights,
    }

    if len(json.dumps(payload).encode("utf-8")) > MAX_DUMP_BYTES:
        raise HttpError(413, "El volcado de pesos supera el límite de 50 MB")

    return JsonResponse(payload)
