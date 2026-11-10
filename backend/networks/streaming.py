import asyncio
import json

import engine_core
from asgiref.sync import sync_to_async
from django.http import StreamingHttpResponse

from datasets.models import Dataset

from .engine import build_model_config, parse_engine_error
from .models import Network
from .service import as_run_out, persist_outcome, reset_after_failure, restore_network

STREAM_MEDIA_TYPE = "text/event-stream"

# Funcion para ver si se ha aceptado el stream
def wants_stream(request) -> bool:
    return STREAM_MEDIA_TYPE in request.headers.get("Accept", "")

# Funcion para pasar de datos a lo que se enviara
def sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"

# Funcion para crear el trainer
def make_trainer(network: Network, dataset: Dataset):
    config = build_model_config(network)
    if dataset.source_type == Dataset.SourceType.CSV:
        return engine_core.LiveTrainer.new_from_csv(
            config, dataset.content, dataset.input_cols
        )
    return engine_core.LiveTrainer.new_from_json(config, dataset.content)

# Funcion para los SSE
def stream_train_response(
    network: Network,
    dataset: Dataset,
    previous_state: str,
    previous_weights: dict | None,
) -> StreamingHttpResponse:
    response = StreamingHttpResponse(
        stream_events(network, dataset, previous_state, previous_weights),
        content_type=STREAM_MEDIA_TYPE,
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


def call(func, *args):
    return sync_to_async(func, thread_sensitive=False)(*args)


def call_db(func, *args):
    return sync_to_async(func, thread_sensitive=True)(*args)

# Funcion de lo que envia la StreamingHttpResponse
async def stream_events(
    network: Network,
    dataset: Dataset,
    previous_state: str,
    previous_weights: dict | None,
):
    finalized = False
    try:
        trainer = await call(make_trainer, network, dataset)
        start_info = await call(trainer.start_info)
        yield sse_event("start", json.loads(start_info))

        expected_epoch = 1
        while True:
            raw = await call(trainer.next_epoch)
            if raw is None:
                break
            epoch = json.loads(raw)
            if epoch.get("epoch") != expected_epoch:
                raise ValueError("Secuencia de épocas inválida en el motor")
            expected_epoch += 1
            yield sse_event("epoch", epoch)

        outcome = json.loads(await call(trainer.result))
        run = await call_db(persist_outcome, network, dataset, outcome)
        finalized = True
        yield sse_event("final", as_run_out(run).model_dump())
    except (GeneratorExit, asyncio.CancelledError):
        if not finalized:
            await call_db(reset_after_failure, network)
        raise
    except ValueError as error:
        code, detail = parse_engine_error(str(error))
        if code == "divergence":
            await call_db(reset_after_failure, network)
        else:
            await call_db(restore_network, network, previous_state, previous_weights)
        yield sse_event("error", {"code": code, "message": detail})
    except Exception:
        await call_db(restore_network, network, previous_state, previous_weights)
        yield sse_event(
            "error",
            {
                "code": "unexpected",
                "message": "Error interno durante el entrenamiento",
            },
        )
