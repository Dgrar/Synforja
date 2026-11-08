import json

from django.http import HttpRequest, JsonResponse

from ninja import Router
from ninja.errors import HttpError
from ninja_jwt.authentication import JWTAuth

from .models import Dataset
from .schemas import DatasetContentOut, DatasetIn, DatasetOut
from .validation import Invalid, Ok, Limit, scan_csv, scan_json

router = Router(auth=JWTAuth())


def dataset_report(entries, total: int) -> JsonResponse:
    return JsonResponse(
        {
            "detail": {
                "violations": [
                    {"row": v.row, "col": v.col, "reason": v.reason} for v in entries
                ],
                "total": total,
            }
        },
        status=422,
    )


def as_out(dataset: Dataset) -> DatasetOut:
    return DatasetOut(
        id=dataset.id,
        name=dataset.name,
        source_type=dataset.source_type,
        content_url=f"/api/datasets/{dataset.id}/content",
        total_rows=dataset.total_rows,
        input_cols=dataset.input_cols,
        output_cols=dataset.output_cols,
    )


def get_own_or_404(user, dataset_id: int) -> Dataset:
    try:
        return Dataset.objects.get(pk=dataset_id, user=user)
    except (Dataset.DoesNotExist, ValueError):
        raise HttpError(404, "Recurso no encontrado")


@router.post("", response={201: DatasetOut})
def create_dataset(request: HttpRequest, payload: DatasetIn):
    if payload.source_type == Dataset.SourceType.CSV:
        outcome = scan_csv(payload.content, payload.input_cols)
    else:
        outcome = scan_json(payload.content)

    if isinstance(outcome, Limit):
        raise HttpError(outcome.status, outcome.message)
    if isinstance(outcome, Invalid):
        return dataset_report(outcome.entries, outcome.total)
    assert isinstance(outcome, Ok)

    if payload.source_type == Dataset.SourceType.CSV:
        stored = payload.content
    else:
        stored = json.dumps(payload.content, separators=(",", ":"))

    dataset = Dataset.objects.create(
        user=request.auth,
        name=payload.name,
        source_type=payload.source_type,
        content=stored,
        total_rows=outcome.rows,
        input_cols=outcome.input_cols,
        output_cols=outcome.output_cols,
    )
    return as_out(dataset)


@router.get("", response=list[DatasetOut])
def list_datasets(request: HttpRequest):
    datasets = Dataset.objects.filter(user=request.auth)
    return [as_out(d) for d in datasets]


@router.get("/{dataset_id}", response=DatasetOut)
def get_dataset(request: HttpRequest, dataset_id: int):
    dataset = get_own_or_404(request.auth, dataset_id)
    return as_out(dataset)


@router.get("/{dataset_id}/content", response=DatasetContentOut)
def get_dataset_content(request: HttpRequest, dataset_id: int):
    dataset = get_own_or_404(request.auth, dataset_id)
    return DatasetContentOut(
        id=dataset.id,
        name=dataset.name,
        source_type=dataset.source_type,
        content=dataset.content,
    )


@router.delete("/{dataset_id}", response={204: None})
def delete_dataset(request: HttpRequest, dataset_id: int):
    dataset = get_own_or_404(request.auth, dataset_id)
    dataset.delete()
    return None
