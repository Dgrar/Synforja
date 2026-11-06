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
| `Network` | `id` auto · `user` FK(User) · `name` str (sin unicidad) · `type` = "MLP" constante · `state` choices `draft/training/trained` (default `draft`) · `layers` JSONField `[{size:int, activation:str}]` · `epochs` int >=1 · `learning_rate` float >0 · `loss` choices `mse/bce/mae` · `training_split` float en (0,1) · `seed` UnsignedIntegerField (generado si no viene) · `created_at` auto |
| `Dataset` | `id` auto · `user` FK(User) · `name` str (sin unicidad) · `source_type` choices `csv/json` · `content` TextField (texto íntegro: CSV puro o JSON) · `total_rows` int · `input_cols` int · `output_cols` int · `created_at` auto |

- Migraciones propias de cada app; `admin.py` registra los modelos (opcional, útil para depurar).
- Riesgo de tamaño: `content` hasta 5 MB en TextField SQLite — asumido en dev; Postgres prod no cambia la interfaz.

## 3. Contratos de API (sync, todas bajo /api/)

| Operación | Ruta (contrato) | Códigos según spec |
|---|---|---|
| Crear red | `POST /api/networks` | 201 (RF-1) · 422 lista completa (RF-8) · 401 (RF-7) |
| Listar redes | `GET /api/networks` | 200 solo propias desc por created_at (RF-3, RF-7) |
| Detalle red | `GET /api/networks/{id}` | 200 completo (RF-2) · 404 uniforme (RF-6) |
| Editar red | `PATCH /api/networks/{id}` | 200; `trained → draft` (RF-4) · 422 (RF-8) · 404 (RF-6) · 409 si training (RF-15) |
| Borrar red | `DELETE /api/networks/{id}` | 204 (RF-5) · 404 (RF-6) · 401 (RF-7) |
| Subir CSV | `POST /api/datasets` (body: `content` str, `input_cols` int, implícito source csv) | 201 + stats (RF-9) · 422 reporte (RF-11/17) · 413/422 límites (RF-12) |
| Subir JSON | `POST /api/datasets` (body: `content` json con bloques entrada/salida paralelos) | 201 + stats (RF-10) · 422 (RF-11/17) |
| Listar/detalle datasets | `GET /api/datasets`, `GET /api/datasets/{id}` | 200 con stats; detalle incluye cómo pedir el contenido (RF-13) |
| Borrar dataset | `DELETE /api/datasets/{id}` | 204 (RF-14) |

- Errores con el formato de casa: `{"detail": ...}` (igual que users).
- RF-16 (persistencia tras reinicio) se cumple por naturaleza del ORM; se verifica con prueba de reinicio.
- Rate-limit: se hereda el throttling global de la NinjaAPI (anon 10/s, auth 100/m); no se añaden límites propios.

## 4. Validación y reporte

- **Red** (RF-8): validar de una pasada y acumular TODAS las violaciones: nº capas ≥ 2 (RN-1), size ≥ 1 por capa (RN-1), activación en enum (RN-2), epochs ≥ 1, lr > 0, loss enum, split 0 < x < 1 (RN-3), y `input_cols` nunca aquí (concepto de dataset). Devolver lista completa, no atajo al primer error.
- **Semilla** (RN-4): si `seed` ausente en el alta, generar entero aleatorio de 64 bits con `secrets` y guardarlo; si viene, aceptarlo tal cual.
- **CSV** (RF-9/11/12): pre-chequeo de límites ANTES de parsear (bytes del body ≈ 5 MB; nº filas ≤ 50 000 tras parseo; `1 <= input_cols < total_cols`). Después: escaneo fila a fila para construir el reporte `{row, col, reason}` (longitud distinta de la esperada; valor no numérico; valor no finito: NaN/inf/nulo/texto). Máx 100 entradas + `total` real si se excede (RF-17). `output_cols = total_cols - input_cols`.
- **JSON** (RF-10/11): dos bloques paralelos (`inputs`, `expects`): validar misma longitud, mismas longitudes internas coherentes y tipos numéricos finitos; el reporte solo considera primera dimensión como "columna" (`col: 0` para block-level, `col: k` para elemento k del vector) y se explica igual en el cuerpo de detalle.
- Rechazo temprano de límites (RF-12): responder antes de cualquier parseo cuando el body excede el tamaño o el nº de filas/columnas es obviamente fuera de rango.

## 5. Estados y aislamiento

- Máquina de estados (RN-5): alta → `draft`; PATCH sobre `trained` → `draft` (las métricas/pesos de la corrida anterior quedan obsoletos a la espera de re-entreno; borrar la red elimina todo lo generado por ella). `training` no se produce en esta fase, pero SI state == `training` → bloquear PATCH/DELETE con 409 (RF-15).
- Aislamiento (RF-6): todos los querysets filtran por `user_id=dueño`; el código de recurso-ajeno y de recurso-inexistente produce la MISMA respuesta 404 (buen patrón: tratarlo como no-existe).
- 401 (RF-7) viene de la dependencia de autenticación bearer en cada operación.

## 6. Tests (puerta de la constitución #4)

- Pruebas por RF (RF-1..RF-17), mapeadas 1 a 1 en tareas.md, con dos usuarios para el aislamiento (RF-3/RF-6) y datasets limitantes (50k filas para RNF-2).
- RNF-1/RNF-2 se vuelven pruebas de rendimiento con tolerancia holgada (medir duración p95 con 100 redes / dataset de 5 MB generados en fixtures); no se miden en CI estricto, pero deben ejecutarse al menos una vez antes de dar la fase por cerrada.
- Servidor real para RF-16: reiniciar `runserver` y volver a hacer GET.

## 7. Riesgos / decisiones abiertas del plan

- El reporte de errores de CSV con posición exacta es O(n filas) sobre el body límite (5 MB) — asumible en <2 s (RNF-2); medir y, si tira mal, particionar el escaneo por bloques.
- PATCH vs PUT — se elige PATCH que admite documento parcial o completo (con el cuerpo completo reusa los mismos validadores del alta, así RF-4 no duplica lógica).
- Plantillas del panel admin no se tocan (ya funcionan).
