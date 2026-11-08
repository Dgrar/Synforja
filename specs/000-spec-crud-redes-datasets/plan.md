# Plan 000 — CRUD de redes neuronales y datasets (F5a)

> Implementación de `specs/000-spec-crud-redes-datasets/spec.md` (aprobada 06-11-2026).
> Este documento es el CÓMO. Verifica cada RF con la prueba indicada en tareas.md.

## 1. Enfoque

- Django apps: **nueva app `networks`** (modelo Network + router) y la app existente **`datasets`** (modelo Dataset + router). Los routers se montan en `backend/core/api.py` con `api.add_router(...)`, igual que ya lo está `/users` con JWT de `ninja-jwt` (AuthBearer).
- Validación de entrada con schemas Pydantic (la constitución lo exige para datasets y nos vale para redes).
- Motor Rust NO entra en esta fase: la validación de CSV/JSON es estructural (Pydantic + escaneo de filas/columnas), no matemática de red. Prohibido llamar `engine_core` aquí.
- Todo síncrono; SQLite dev; sin dependencias nuevas.

## 2. Modelos y migraciones

| Modelo | Campos |
|--------|--------|
| `Network` | `id` auto · `user` FK(User) · `name` str, máx 100, requerido (sin unicidad) · `type` = "MLP" constante · `state` choices `draft/training/trained` (default `draft`) · `layers` JSONField `[{size:int, activation:str}]` · `epochs` int >=1 · `learning_rate` float >0 · `loss` choices `mse/bce/mae` · `training_split` float en (0,1) · `seed` PositiveBigIntegerField (u63; generado si no viene) · `created_at` auto |
| `Dataset` | `id` auto · `user` FK(User) · `name` str (sin unicidad) · `source_type` choices `csv/json` · `content` TextField (texto íntegro: CSV puro o JSON) · `total_rows` int · `input_cols` int · `output_cols` int · `created_at` auto |

- Migraciones propias de cada app; `admin.py` registra los modelos (opcional, útil para depurar).
- Riesgo de tamaño: `content` hasta 5 MB en TextField SQLite — asumido en dev; Postgres prod no cambia la interfaz.

## 3. Contratos de API (sync, todas bajo /api/)

| Operación | Ruta (contrato) | Códigos según spec |
|---|---|---|
| Crear red | `POST /api/networks` | 201 (RF-1) · 422 lista completa (RF-8) · 401 (RF-7) |
| Listar redes | `GET /api/networks` | 200 solo propias desc por created_at (RF-3, RF-7) |
| Detalle red | `GET /api/networks/{id}` | 200 completo (RF-2) · 404 uniforme (RF-6) |
| Editar red | `PATCH /api/networks/{id}` | 200; `trained → draft` (RF-4) · 422 (RF-8/RF-18) · 404 (RF-6) · 409 si training (RF-15) |
| Borrar red | `DELETE /api/networks/{id}` | 204 (RF-5) · 404 (RF-6) · 401 (RF-7) |
| Subir CSV | `POST /api/datasets` (body: `source_type: "csv"`, `content` str, `input_cols` int ≥ 1; enmienda II: explícito) | 201 + stats (RF-9) · 422 reporte (RF-11/17) · 413/422 límites (RF-12) |
| Subir JSON | `POST /api/datasets` (body: `source_type: "json"`, `content` objeto con bloques `inputs`/`expects`; sin `input_cols`) | 201 + stats (RF-10) · 422 (RF-11/17) |
| Listar/detalle datasets | `GET /api/datasets`, `GET /api/datasets/{id}` | 200 con stats; detalle incluye `content_url` (RF-13) |
| Contenido dataset | `GET /api/datasets/{id}/content` | 200 `{id, name, source_type, content}` con el contenido íntegro (RF-13) |
| Borrar dataset | `DELETE /api/datasets/{id}` | 204 (RF-14) |

- Errores con el formato de casa: `{"detail": ...}` (igual que users).
- RF-16 (persistencia tras reinicio) se cumple por naturaleza del ORM; se verifica con prueba de reinicio.
- Rate-limit: se hereda el throttling global de la NinjaAPI (anon 10/s, auth 100/m); no se añaden límites propios.

## 4. Validación y reporte

- **Red** (RF-8): validar de una pasada y acumular TODAS las violaciones: nº capas ≥ 2 (RN-1), size ≥ 1 por capa (RN-1), activación en enum (RN-2), epochs ≥ 1, lr > 0, loss enum, split 0 < x < 1 (RN-3), y `input_cols` nunca aquí (concepto de dataset). Devolver lista completa, no atajo al primer error.
- **Semilla** (RN-4): si `seed` ausente en el alta, generar entero aleatorio con `secrets.randbits(63)` (u63: cabe en INTEGER de SQLite/Postgres; decisión del bloque A) y guardarlo; si viene, aceptarlo tal cual dentro de [0, 2^63-1].
- **CSV** (RF-9/11/12): pre-chequeo de límites ANTES de parsear (bytes del body ≈ 5 MB; nº filas ≤ 50 000 tras parseo; `1 <= input_cols < total_cols`). Después: escaneo fila a fila para construir el reporte `{row, col, reason}` (longitud distinta de la esperada; valor no numérico; valor no finito: NaN/inf/nulo/texto). Máx 100 entradas + `total` real si se excede (RF-17). `output_cols = total_cols - input_cols`.
- **Redes (RF-18)**: topes `MAX_LAYERS = 20` y `MAX_LAYER_NEURONS = 2048` como constantes en `networks/schemas.py`; se aplican en `LayerIn.size` (le) y `NetworkIn.layers` (max_length). PATCH revalida con `NetworkIn`, así el mismo tope cubre alta y edición. Decidido 08-11-2026.
- **JSON** (RF-10/11): dos bloques paralelos (`inputs`, `expects`): validar misma longitud, mismas longitudes internas coherentes y tipos numéricos finitos; el reporte solo considera primera dimensión como "columna" (`col: 0` para block-level, `col: k` para elemento k del vector) y se explica igual en el cuerpo de detalle.
- Rechazo temprano de límites (RF-12): responder antes de cualquier parseo cuando el body excede el tamaño o el nº de filas/columnas es obviamente fuera de rango.

### 4.1 Decisiones del bloque C (08-11-2026, enmienda II de la spec)

- **`source_type` explícito** en `POST /api/datasets` (sustituye la inferencia por forma del plan original): errores nítidos (un CSV sin `input_cols` se reporta como CSV, no como "JSON malformado"); `input_cols` obligatorio en CSV y prohibido en JSON.
- **Numeración 1-based** en el reporte (fila 1 = primera), claves `row`/`col`/`reason`; `reason` en texto español (mensajes al usuario), claves en inglés (API).
- **Contratos de error**: violaciones → 422 `{"detail": {"violations": [...], "total": N}}` (dict, no `HttpError`: ninja 1.7.1 hace `str(detail)` y los dicts explotan → se devuelve `JsonResponse` directo). Límites → `HttpError` plano (413/422). Código de lógica en `datasets/validation.py` (pura, sin HTTP) con outcomes `Ok | Limit | Invalid`.
- **Tamaño medido sobre el contenido** (`len(content.encode("utf-8"))` para CSV, `len(json.dumps(content, separators compactos))` para JSON — exactamente los bytes que se almacenan), no sobre el request.
- **Anchura de referencia CSV** = primera fila NO vacía; fila vacía media = violación "fila vacía" (CSV puro, estricto); espacios sobrantes se aceptan (`float(" 1 ")` vale).
- **JSON**: claves exactas `inputs`/`expects` (extra = violación); filas de referencia = fila 1 de cada bloque (si mide 0 → violación "vacíos"); desbalance de bloques = violación block-level col 0; `bool` NO es número; escaneo de ambos bloques sigue aunque el nº de filas difiera (reporte completo).
- **`content_url` en `DatasetOut`** (RF-13): camino `/api/datasets/{id}/content` (otro endpoint para no cargar el detalle con hasta 5 MB); dicho endpoint devuelve `{id, name, source_type, content}`.
- **Almacenamiento**: CSV tal cual llega; JSON re-serializado compacto `separators=(",", ":")` (los valores ya salieron validados finitos).

## 5. Estados y aislamiento

- Máquina de estados (RN-5): alta → `draft`; PATCH sobre `trained` → `draft` (las métricas/pesos de la corrida anterior quedan obsoletos a la espera de re-entreno; borrar la red elimina todo lo generado por ella). `training` no se produce en esta fase, pero SI state == `training` → bloquear PATCH/DELETE con 409 (RF-15).
- Aislamiento (RF-6): todos los querysets filtran por `user_id=dueño`; el código de recurso-ajeno y de recurso-inexistente produce la MISMA respuesta 404 (buen patrón: tratarlo como no-existe).
- 401 (RF-7) viene de la dependencia de autenticación bearer en cada operación.

## 6. Tests (puerta de la constitución #4)

- Pruebas por RF (RF-1..RF-17), mapeadas 1 a 1 en tareas.md, con dos usuarios para el aislamiento (RF-3/RF-6) y datasets limitantes (50k filas para RNF-2).
- RNF-1/RNF-2 se vuelven pruebas de rendimiento con tolerancia holgada (medir duración p95 con 100 redes / dataset de 5 MB generados en fixtures); no se miden en CI estricto, pero deben ejecutarse al menos una vez antes de dar la fase por cerrada.
- Servidor real para RF-16: reiniciar `runserver` y volver a hacer GET.

## 7. Riesgos / decisiones abiertas del plan

- El límite de upload de 5 MB (RF-12) choca con el default de Django `DATA_UPLOAD_MAX_MEMORY_SIZE` (2,5 MB): subir un dataset de 5 MB daría 400 antes de llegar a nuestro handler. Subido ya a 6,5 MB en settings el 08-11-2026, antes del bloque C.

- El reporte de errores de CSV con posición exacta es O(n filas) sobre el body límite (5 MB) — asumible en <2 s (RNF-2); medir y, si tira mal, particionar el escaneo por bloques.
- PATCH vs PUT — se elige PATCH que admite documento parcial o completo (con el cuerpo completo reusa los mismos validadores del alta, así RF-4 no duplica lógica).
- Plantillas del panel admin no se tocan (ya funcionan).
- Decisiones del bloque A (06-11-2026): `name` máx 100 y requerido en red y dataset; activaciones normalizadas a minúsculas antes de validar (RN-2 case-insensitive); semilla u63 con `secrets.randbits(63)` en `PositiveBigIntegerField`.
