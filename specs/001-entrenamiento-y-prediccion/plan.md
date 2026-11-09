# Plan 001 — Entrenamiento, runs y predicción (F5b)

> Implementación de `specs/001-entrenamiento-y-prediccion/spec.md` (aprobada 08-11-2026).
> Este documento es el CÓMO. Cada tarea termina con sus tests en verde (constitución #4).

## 1. Enfoque

- Tres fronteras tocan la misma fase: **motor Rust** (contrato nuevo con semilla, errores tipados y capacidad de predict), **puente Python** (exposición de lo nuevo) y **Django** (modelo `Run`, endpoints train/runs/predict/volcado). Django nunca calcula; el motor nunca sabe de HTTP ni DB.
- Corte fino del motor en este plan (hallazgos del código actual, `engine-core/src/nn_config/json_to_nn.rs` y `neural_network.rs`):
  1. La config de entrenamiento **no lleva `seed`** y usa `rng()` sin semilla → F5b obliga a `ChaCha8Rng::seed_from_u64(seed)` (§14.15) y se ELIMINA el fallback no determinista.
  2. `process_csv` usa `has_headers(true)` → se comería la primera fila real del dataset (spec 000: CSV puro sin cabecera). Corregir a `has_headers(false)`.
  3. `Activation::Tanh` no tiene alias minúscula (`tanh` rompería el contrato de activaciones de la spec 000 RN-2). Añadir alias.
  4. Métricas finales con semántica defectuosa: `mse_loss` es el MÁXIMO de errores del test y `r_square`/`accuracy` quedan con el valor del ÚLTIMO ejemplo (y `Accuracy` multiclase con 1 fila indexa mal → pánico `unwrap` sobre iterador vacío). Se re-trabaja: **media de MSE por ejemplo**, **R² en streaming (dos pasadas, sin materializar la matriz de predicciones)**, **accuracy = media por ejemplo** (binaria umbral 0,5 / argmax multiclase por fila).
  5. `backward` con SoftMax es `todo!()` (pánico). Se convierte en error tipado → 422 con motivo claro (la topología es legal pero no entrenable hoy; se registra como limitación).
  6. Comprobación de split vacío y de divergencia: dentro del motor, donde vive la verdad del contar; Django replica nada.

## 2. Motor Rust (contrato nuevo)

- **Config** (JSON que Django envía al motor): añade `"seed": u64` obligatorio junto a `layers/loss_fn/lr/epochs/training_split`. Mapeo de loss de casa: `mse→mse_loss`, `bce→bce_loss`, `mae→mae_loss`.
- **Errores tipados (§14.18)**: `EngineError` con `thiserror` en `engine-core/src/`: variantes `Config`, `Shape`, `EmptySplit`, `Divergence`, `SoftmaxNotImplemented`, `Dataset`, `Unexpected`. PyO3 los expone como `PyValueError` con prefijo estable `engine::<código>: <mensaje>`; Django parsea el código → 422 (Config/Shape/EmptySplit/Divergence/SoftmaxNotImplemented/Dataset) o 500 (Unexpected). Sin excepciones Python nuevas.
- **Split** (igual regla actual): `split_point = trunc(filas × split)`; train = primer tramo, test = el resto. SI tramo train o test vacío → `EngineError::EmptySplit` ANTES de entrenar (RF-9). Fuente única de verdad de conteo: el motor.
- **Divergencia** (RF-10): al final de CADA época, comprobar finitud de todos los pesos y sesgos → `EngineError::Divergence`. No se comprueba por ejemplo (coste).
- **One-shot** expuesto: `train_json(model_data, training_data)` (JSON `{inputs, expects}`) y `train_csv(model_data, csv, input_columns)` devuelven `TrainingOutcome` JSON:
  ```json
  { "network": {"weights": [...], "biases": [...], "topology": [...]},
    "mse_loss": f32, "r_square": f32, "accuracy": f32,
    "split": {"train_rows": int, "test_rows": int} }
  ```
- Red no entrenable: SI alguna capa de la topología es softmax, ENTONCES el motor responderá `EngineError::SoftmaxNotImplemented` → 422 con motivo (limitación documentada).
- **Predict** (RF-14/17): `Network::from_send_information(info) -> Result<Network>` (valida longitudes de weights/biases contra la topología) + `forward_vector(&[f32]) -> Result<Vec<f32>>`. Nueva `#[pyfunction] predict_json(network_json: String, x: Vec<f32>) -> PyResult<Vec<f32>>` (error de Shape si longitud ≠ primera capa o no finitos).
- **Verificación de volcado** (criterio RF-14): `#[pyfunction] evaluate_json(network_json, dataset_json, loss_name) -> métricas` reusa la evaluación de test sobre una red reconstruida.
- **Tests Rust**: XOR JSON/CSV (sin fila de cabecera ahora), seno multi-semilla y diabetes se ajustan a semilla fija; nuevos: split vacío, divergencia (lr 100 → pesos no finitos), softmax 422-tipo, predict redondo (volcado→rebuild→mismas salidas bit a bit), determinismo bit a bit (dos corridas misma semilla). `cargo test` verde.

## 3. Puente Python

- `python/engine_core/__init__.py` sigue exportando los 3 existentes y AÑADE `predict_json` y `evaluate_json` (la información de split viaja dentro del outcome JSON, no hace falta función aparte). Tras cada cambio del crate: `cmd /c ".venv\Scripts\maturin.exe develop"`; para benchmarks, `--release`.

## 4. Django: modelos (backend/networks)

| Modelo/Campo | Definición |
|---|---|
| `Network.weights` | JSONField `null=True` (payload del motor: weights/biases/topology); se LIMPIA a `null` en el paso trained→draft (RF-16) |
| `Run` (nuevo) | `network` FK Network CASCADE related_name `runs` · `dataset_id` PositiveBigIntegerField (SIN FK: RN-3/la referencia informativa sobrevive al borrado del dataset, RN-4) · `total_rows`, `input_cols`, `output_cols` (fotografía de las estadísticas al entrenar) · `mse_loss`, `r_square`, `accuracy` FloatField · `created_at` auto |
| `Run.Meta` | `ordering = ["-created_at", "-id"]` (RF-12 desc estable) |

- Reglas: entrenar desde `training` → 409 (RF-6); MIENTRAS la corrida vive, state = `training` guardado en DB → PATCH/DELETE 409 (RF-11 = RF-15 de 000 en acción). Edición en `trained` ya existe: añade limpiar `weights` y que la red quede `draft` (histórico de runs intacto, RF-16). Borrar red borra runs por CASCADE (RN-5).

## 5. Django: endpoints (backend/networks/api.py, schemas.py)

| Operación | Ruta | Códigos / cuerpo |
|---|---|---|
| Entrenar (one-shot) | `POST /api/networks/{id}/train` body `{dataset_id}` | 201 con el run creado (RF-4) · 404 red o dataset ajeno/inexistente (RF-2) · 404 dataset de otro dueño (RF-2) · 409 si state `training` (RF-6) · 422 incompatibilidad forma (RF-7: mensaje plano indicando capa/columnas) · 422 topes de coste (RF-8: epochs ≤ 10 000, lr ∈ (0,1], presupuesto `epochs × total_rows ≤ 5 000 000`) · 422 split vacío (RF-9, vía `EmptySplit` del motor) · 422 divergencia (RF-10, vía `Divergence`; red → `draft`, sin pesos ni run) · 401 (RF-1) |
| Ver el entrenamiento en curso | los propios PATCH/DELETE ya bloqueados por RF-15 | 409 (RF-11) |
| Runs | `GET /api/networks/{id}/runs` | 200 lista desc (cada corrida con métricas + dataset `id/total_rows/input_cols/output_cols`) (RF-12) · 200 lista vacía (RF-13) · 404/401 como siempre |
| Predict | `POST /api/networks/{id}/predict` body `{"input": [...finitos...]}` | 200 `{"output": [...]}` len = última capa (RF-17) · 409 si state ≠ `trained` (RF-18) · 422 longitud ≠ primera capa o valores no finitos (RF-19) |
| Volcado de pesos | `GET /api/networks/{id}/weights` | 200 `{config, network}` donde `config` = layers/epochs/lr/loss/training_split/seed y `network` = payload del motor (RF-14) · 409 si no `trained` · 413 si el volcado (estimado o real) supera 50 MB (RF-15) · 404/401 |

- **Orden de validaciones del train** (secuencial, primer error gana; mensajes planos `HttpError`, no acumulados — la spec de esta fase no pide acumulación): auth → red propia/existente → dataset propio/existente → state ≠ training → compatibilidad (RF-7) → presupuesto/topes (RF-8) → marcar `training` → motor → persistencia única (state `trained` + weights + run en la misma transacción) o limpieza (`draft`, sin pesos, sin run).
- **Topes de coste en el train (RF-8)**: el presupuesto se mide con las filas del dataset elegido en CADA llamada; los topes restringen el entrenamiento, no el alta (una red creada en F5a con lr = 2 o epochs = 10 001 es válida como recurso y fallará aquí en 422 hasta que se edite).
- **RF-15 (50 MB)**: chequeo en dos capas — estimación barata desde la topología (`Σ (n_i × n_{i+1} + n_{i+1})`) con coste por float de 19 bytes (peor caso f32→JSON) → si estimación > 50 MB → 413 SIN montar el volcado; si pasa, se monta el JSON real y se mide `len(utf-8)` → 413 si aún excede.
- **Sin lógica de red en Django**: ninguna operación numérica ahí; todo cálculo va vía wrapper `engine_core`.
- Autenticación/aislamiento idénticos a la fase previa (`JWTAuth`, `get_own_or_404`).

## 6. Tests (constitución #4)

- Unitarios puros de Django: presupuesto de pasos y topes (bordes), compatibilidad de formas, orden de validaciones, estimador de 50 MB (bordes), orden del listado de runs y permanencia del historial al editar, run sin FK de dataset (borrar el dataset → run íntegro).
- Con motor: entrenar red pequeña con seed fija vía API e idénticas métricas bit a bit en dos corridas (RNF-4 del spec — es funcional); predict desde volcado; 422 por divergencia forzada (lr 100) y estado final `draft` sin pesos ni run (RF-10).
- La puerta de tests sigue en MD5 (`core/apitest.py`) y con la suite completa en verde antes de cerrar la fase; mensajes de error en español (mensajes para usuario).

## 7. Riesgos / decisiones del plan

- **RNF-1 enmendado y aprobado** (08-11-2026): la referencia original (50 000 filas × 1 000 epochs = 5 × 10⁷ pasos) violaba el presupuesto de pasos de RN-1 (≤ 5 × 10⁶) y su umbral de 30 s era inalcanzable sin vectorización. El dueño aprobó la regla general: **la referencia de benchmark SIEMPRE dentro del presupuesto legal**, con 5 000 filas × 7 columnas × 1 000 epochs (5 000 000 de pasos, el tope exacto) y umbral **<   5 minutos (p95)** — elevado a petición explícita del dueño: una red relativamente densa no llega a hacer nada en 60 s. Si el número medido lo supera, se discute activar Rayon (§14.17) o recalibrar con el número medido.
  - **Medido y resuelto (08-11-2026):** primera pasada 334,7 s (> 300 s). El dueño eligió optimizar el lazo escalar (no Rayon). Tras especializar matmul con vector columna, quitar trasposiciones del backward y pasar activación/bias/update a in-place: **124,8 s** en la corrida aislada y **127,1 s** en la suite completa, con mse/r² idénticos. Bench reproducible: `engine-core/tests/train_bench.rs` (126,2 → 27,6 µs/paso). RNF-1 se cumple sin enmienda adicional.
- **Softmax no entrenable** (hallazgo 6): 422 con motivo claro en lugar de pánico del proceso. La spec no lo contradice (la red es legal pero hoy el motor no sabe entrenarla); limitación registrada aquí para no sorprender en F6.
- El campo `weights` JSONField guarda los floats del motor ya reconstruidos como float de Python (doble exacto del f32): ida y vuelta bit-exact; se verifica en el test de predict tras re-entrenar.
- Un solo proceso Django con `runserver` multi-hilo: el lock `training` vía ORM es suficiente en dev; múltiples workers NO forman parte del alcance de esta fase.
- El bloqueo de edición/borrado durante la corrida (RF-11): al ser sync y apoyarse en state DB, la ventana es la vida de la petición; cubierto con las mismas reglas de RF-15 de la 000.
- La semilla u63 del modelo cabe en `PositiveBigIntegerField` existente; el motor la recibe como `u64` (es memcpy sin pérdida).
