import csv
import io
import json
import math
from dataclasses import dataclass

MAX_CONTENT_BYTES = 5 * 1024 * 1024
MAX_ROWS = 50_000
MAX_REPORT = 100

BLOCK_KEYS = ("inputs", "expects")


@dataclass(frozen=True)
class Violation:
    row: int
    col: int
    reason: str


@dataclass(frozen=True)
class Ok:
    rows: int
    input_cols: int
    output_cols: int


@dataclass(frozen=True)
class Limit:
    status: int
    message: str


@dataclass(frozen=True)
class Invalid:
    entries: list[Violation]
    total: int


def _invalid(entries: list[Violation], total: int | None = None) -> Invalid:
    return Invalid(entries[:MAX_REPORT], total if total is not None else len(entries))


def _check_number(field: str) -> str | None:
    try:
        value = float(field)
    except (TypeError, ValueError):
        return "valor no numérico"
    if not math.isfinite(value):
        return "valor no finito"
    return None


def scan_csv(content, input_cols: int) -> Ok | Limit | Invalid:
    if not isinstance(content, str):
        return _invalid([Violation(0, 0, "el contenido debe ser texto (CSV)")])
    if len(content.encode("utf-8")) > MAX_CONTENT_BYTES:
        return Limit(413, "El dataset supera el límite de 5 MB")
    rows = list(csv.reader(io.StringIO(content, newline="")))
    if len(rows) > MAX_ROWS:
        return Limit(422, "El dataset supera el límite de 50 000 filas")
    if not rows:
        return Limit(422, "El CSV está vacío o no contiene filas")

    reference = next((row for row in rows if row), None)
    if reference is None:
        return Limit(422, "El CSV no contiene filas válidas")
    width = len(reference)
    if not isinstance(input_cols, int) or not 1 <= input_cols < width:
        return Limit(
            422,
            f"input_cols ({input_cols}) debe estar entre 1 y {width - 1} "
            f"para un CSV de {width} columnas",
        )

    entries: list[Violation] = []
    total = 0
    for row_index, row in enumerate(rows, start=1):
        if not row:
            total += 1
            if len(entries) < MAX_REPORT:
                entries.append(Violation(row_index, 0, "fila vacía"))
            continue
        if len(row) != width:
            total += 1
            if len(entries) < MAX_REPORT:
                entries.append(
                    Violation(
                        row_index,
                        0,
                        f"la fila tiene {len(row)} valores, se esperaban {width}",
                    )
                )
            continue
        for col_index, field in enumerate(row, start=1):
            reason = _check_number(field)
            if reason is None:
                continue
            total += 1
            if len(entries) < MAX_REPORT:
                entries.append(Violation(row_index, col_index, reason))
    if entries:
        return _invalid(entries, total)
    return Ok(len(rows), input_cols, width - input_cols)


def _json_size(content) -> int:
    return len(json.dumps(content, separators=(",", ":")).encode("utf-8"))


def _check_json_value(value, cause: str) -> str | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return f"no es un número ({cause})"
    if not math.isfinite(float(value)):
        return f"no es finito ({cause})"
    return None


def scan_json(content) -> Ok | Limit | Invalid:
    entries: list[Violation] = []
    total = 0
    add = entries.append

    def count() -> None:
        nonlocal total
        total += 1

    def keep() -> bool:
        return len(entries) < MAX_REPORT

    if not isinstance(content, dict):
        return _invalid(
            [Violation(0, 0, "el contenido debe ser un objeto con los bloques inputs y expects")]
        )

    missing = [key for key in BLOCK_KEYS if key not in content]
    extra = [key for key in content if key not in BLOCK_KEYS]
    for key in missing:
        count()
        if keep():
            add(Violation(0, 0, f"falta la colección {key}"))
    for key in extra:
        count()
        if keep():
            add(Violation(0, 0, f"solo se admiten las colecciones {BLOCK_KEYS[0]} y {BLOCK_KEYS[1]}"))
    if missing or extra:
        return _invalid(entries, total)

    inputs = content["inputs"]
    expects = content["expects"]
    blocks_invalid = False
    for label, block in (("inputs", inputs), ("expects", expects)):
        if not isinstance(block, list):
            count()
            if keep():
                add(Violation(0, 0, f"la colección {label} debe ser una lista"))
            blocks_invalid = True
    if blocks_invalid:
        return _invalid(entries, total)

    if _json_size(content) > MAX_CONTENT_BYTES:
        return Limit(413, "El dataset supera el límite de 5 MB")
    if len(inputs) > MAX_ROWS:
        return Limit(422, "El dataset supera el límite de 50 000 filas")
    if len(inputs) == 0:
        return Limit(422, "El JSON no contiene ejemplos (colecciones vacías)")

    input_width = len(inputs[0])
    output_width = len(expects[0])
    if input_width == 0 or output_width == 0:
        count()
        if keep():
            add(
                Violation(
                    0,
                    0,
                    "los vectores de entrada y salida no pueden estar vacíos",
                )
            )
    if len(inputs) != len(expects):
        count()
        if keep():
            add(
                Violation(
                    0,
                    0,
                    "los bloques inputs y expects tienen nº de filas distinto "
                    f"({len(inputs)} y {len(expects)})",
                )
            )

    for label, block, width in (("inputs", inputs, input_width), ("expects", expects, output_width)):
        for row_index, row in enumerate(block, start=1):
            if len(row) != width:
                count()
                if keep():
                    add(
                        Violation(
                            row_index,
                            0,
                            f"la fila {row_index} de {label} tiene {len(row)} valores, "
                            f"se esperaban {width}",
                        )
                    )
                continue
            for col_index, value in enumerate(row, start=1):
                reason = _check_json_value(value, label)
                if reason is None:
                    continue
                count()
                if keep():
                    add(Violation(row_index, col_index, reason))
    if entries:
        return _invalid(entries, total)
    return Ok(len(inputs), input_width, output_width)
