from ninja import Schema
from pydantic import Field


class DatasetCsvIn(Schema):
    name: str = Field(max_length=100)
    content: str = Field(min_length=1)
    input_cols: int = Field(ge=1)


class DatasetJsonIn(Schema):
    name: str = Field(max_length=100)
    content: str = Field(min_length=1)
