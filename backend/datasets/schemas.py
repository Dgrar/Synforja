from typing import Any, Literal, Optional

from ninja import Schema
from pydantic import Field, model_validator

SourceKind = Literal["csv", "json"]

MAX_NAME_CHARS = 100


class DatasetIn(Schema):
    source_type: SourceKind
    name: str = Field(max_length=MAX_NAME_CHARS)
    content: Any = None
    input_cols: Optional[int] = Field(default=None, ge=1)

    @model_validator(mode="after")
    def check_dispatch(self) -> "DatasetIn":
        if self.source_type == "csv" and self.input_cols is None:
            raise ValueError("input_cols es obligatorio para datasets CSV")
        if self.source_type == "json" and self.input_cols is not None:
            raise ValueError("input_cols no se declara en datasets JSON")
        return self


class DatasetOut(Schema):
    id: int
    name: str
    source_type: str
    content_url: str
    total_rows: int
    input_cols: int
    output_cols: int


class DatasetContentOut(Schema):
    id: int
    name: str
    source_type: str
    content: str
