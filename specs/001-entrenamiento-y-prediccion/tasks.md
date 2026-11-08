# Tasks 001 — Entrenamiento, runs y predicción (F5b)

> Ejecución de `plan.md` contra `spec.md`. Cada tarea termina con sus tests en verde (constitución #4).
> Marca `[x]` al completar; no avances de bloque con tests rojos.
> Requisitos Rust/PyO3: recompilar con `cmd /c ".venv\Scripts\maturin.exe develop"` tras cada tarea del motor.

## Bloque A — Contrato del motor (Rust + PyO3)

- [ ] **T1. Semilla obligatoria** — `ChaCha8Rng::seed_from_u64(seed)` en `create_and_train`: campo `seed` (u64, obligatorio) en la config JSON; fuera el `rng()` no determinista (§14.15). Mismo stream para el shuffle por época (consumo secuencial).
      *Hecho si:* dos corridas con la misma seed producen métricas y pesos bit a bit idénticos (nuevo test de determinismo en Rust); `cargo test` verde.
- [ ] **T2. Errores tipados** — `EngineError` (`thiserror`, §14.18) con variantes `Config/Shape/EmptySplit/Divergence/SoftmaxNotImplemented/Dataset/Unexpected`; pyfunctions devuelven `PyValueError` con prefijo `engine::<código>: <mensaje>`. Migrar `String` → `EngineError` en todo el crate.
      *Hecho si:* `cargo test` verde sin warnings nuevos; los tests antiguos de mensajes esperan el nuevo formato.
- [ ] **T3. Correcciones de contrato** — (a) `process_csv` con `has_headers(false)` (spec 000: CSV puro); (b) alias `tanh` en `Activation::Tanh`; (c) `EmptySplit` cuando la partición train o test queda vacía, comprobado ANTES de entrenar; (d) `SoftmaxNotImplemented` en vez de `todo!()` en el backward.
      *Hecho si:* tests nuevos: CSV sin cabecera entrena con todas las filas (comprueba nº de ejemplos), `tanh` minúscula en config funciona, dataset de 1 fila con split 0,8 → `EmptySplit`, red con capa softmax → error tipado (no pánico).
- [ ] **T4. Métricas honestas de test** — `mse_loss` = media de MSE por ejemplo del test; `r_square` en streaming (dos pasadas por el test, sin materializar la matriz de predicciones); `accuracy` = media por ejemplo (binaria umbral 0,5 / argmax multiclase por fila, sin el bug de indexación que daba pánico). Outcome añade `split: {train_rows, test_rows}`.
      *Hecho si:* tests numéricos: XOR/seno/diabetes con semillas fijas dan métricas conocidas coherentes (seno con r² > 0,9 tolerable), y red de salida multicolumna no pánico; `cargo test` verde.
- [ ] **T5. Predict y verificación de volcado** — `Network::from_send_information` (valida longitudes contra la topología) + `forward_vector`; pyfunctions `predict_json(network_json, x) -> Vec<f32>` y `evaluate_json(network_json, dataset_json, loss_name) -> métricas`. Re-instalar la extensión.
      *Hecho si:* test Rust: volcado → rebuild → mismas salidas bit a bit; `import engine_core; predict_json(...)` desde Python funciona tras `maturin develop`.

## Bloque B — Entrenamiento one-shot y runs (Django)

- [ ] **T6. Modelo `Run` y pesos** — migración: `Network.weights` JSONField null + modelo `Run` (plan §4: `dataset_id` SIN FK + fotografía de stats + métricas Float + created_at orden desc estable). Registro en admin opcional.
      *Hecho si:* `makemigrations networks` genera migración y `manage.py check` pasa.
- [ ] **T7. Schemas y helpers** — `TrainIn {dataset_id}`, `RunOut {id, mse_loss, r_square, accuracy, dataset: {id, total_rows, input_cols, output_cols}}`; constructor del JSON de config para el motor (mapeo loss `mse→mse_loss`…); estimador de bytes del volcado desde la topología.
      *Hecho si:* unit tests de schemas y del estimador (bordes 50 MB con ×19/float).
- [ ] **T8. Endpoint `POST /networks/{id}/train`** — validaciones secuenciales (plan §5): red y dataset propios (404 uniforme), state (409), compatibilidad de formas (422, RF-7), topes de coste con `epochs × total_rows` del dataset elegido (422, RF-8), marcar `training`, llamada a `engine_core.train_json`, persistencia única final (state `trained` + weights + run) o limpieza (`draft`, sin pesos, sin run en divergencia/split).
      *RF:* RF-3 (respuesta al terminar), RF-4 (201 + run + estado `trained` + pesos), RF-5 (re-entrena y el histórico crece), RF-6 (409), RF-7/8/9/10 (422 con motivo), RF-1/2 (401/404).
      *Hecho si:* tests de red verdadera XOR train con seed fija → métricas en la respuesta; los 6 códigos de error cubiertos; divergencia forzada (lr 100) deja la red en `draft` sin pesos ni run.
- [ ] **T9. Endpoint `GET /networks/{id}/runs`** — listado desc del dueño (plan §5); RF-12 (3 corridas con datasets distintos → orden y contenidos correctos), RF-13 (vacío).
      *Hecho si:* tests del listado + permanencia: borrar el dataset de un run histórico no altera la corrida (RN-4), editar la red no reescribe runs (RN-7).
- [ ] **T10. Lock y estados en dura** — PATCH sobre `trained` limpia `weights` y deja `draft` (RF-16 parte A); PATCH/DELETE sobre `training` → 409 (RF-11).
      *Hecho si:* tests de ambas transiciones (histórico intacto tras editar, 409 en ambas rutas).

## Bloque C — Predicción y volcado (Django)

- [ ] **T11. Endpoint `POST /networks/{id}/predict`** — state ≠ `trained` → 409 (RF-18); vector: longitud = primera capa, todos finitos, si no 422 (RF-19); llamada a `predict_json`, respuesta `{"output": [...]}` (RF-17).
      *Hecho si:* tests: vector correcto → salida de longitud última capa con valores esperados contra los de Rust; longitudes/NaN/texto → 422; red `draft` → 409.
- [ ] **T12. Endpoint `GET /networks/{id}/weights`** — volcado completo `{config, network}` (RF-14) con la verificación de igualdad vía `evaluate_json` en el test (reconstruido en el sistema, métricas idénticas al run); 413 dos capas cuando el volcado supera 50 MB (RF-15: primero estimación, luego medición real); 409 si no `trained`.
      *Hecho si:* tests: volcado de red pequeña contiene semilla+config+pesos y reproduce métricas igual al run; 413 por estimación con red monstruo sintética; 409 en `draft` post-edición (RF-16 parte B).

## Bloque D — RNF, e2e y cierre

- [ ] **T13. Rendimiento** — añadir a `core/perf.py` (fuera de la suite general): RNF-3 (listado de runs con 100 corridas < 200 ms p95); benchmark RNF-1 con la referencia aprobada en la enmienda (5 000 filas × 7 columnas × 1 000 epochs = 5 000 000 pasos legales, seed fija, `maturin develop --release`) y umbral < 5 minutos (p95); registro del número real.
      *Hecho si:* números impresos y dentro de umbral (o desviación documentada aquí con propuesta: Rayon §14.17 o recalibrado).
      > Resultados: (pendiente de ejecución)
- [ ] **T14. Pasada e2e con servidor real** — register/login → crear red + dataset → train (201 + run) → predict → volcado → runs → editar → re-entrenar → **reinicio del servidor → RF-20** (estado `trained`, pesos, volcado y runs sobreviven). Apuntar desviaciones.
      > Resultados: (pendiente de ejecución)
- [ ] **T15. Cierre de la fase 001** — `manage.py check` + `manage.py test` + `cargo test` todo verde; resumen §2 (qué/cómo/se verifica); AGENTS.md §12 y §14 actualizados (contrato del motor: seed, errores tipados, predict).

## Matriz RF → tarea

| RF | Tarea |
|----|-------|
| 1, 2 | T8 (+T11, T12 en sus rutas) |
| 3, 4, 5 | T8 |
| 6 | T8 |
| 7, 8 | T8 |
| 9, 10 | T8 (motor: T3, T4) |
| 11 | T10 |
| 12, 13 | T9 |
| 14, 15 | T12 |
| 16 | T10, T12 |
| 17, 18, 19 | T11 |
| 20 | T14 (manual) |
