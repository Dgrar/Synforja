# Tasks 001 — Entrenamiento, runs y predicción (F5b)

> Ejecución de `plan.md` contra `spec.md`. Cada tarea termina con sus tests en verde (constitución #4).
> Marca `[x]` al completar; no avances de bloque con tests rojos.
> Requisitos Rust/PyO3: recompilar con `cmd /c ".venv\Scripts\maturin.exe develop"` tras cada tarea del motor.

## Bloque A — Contrato del motor (Rust + PyO3)

- [x] **T1. Semilla obligatoria** — `ChaCha8Rng::seed_from_u64(seed)` en `create_and_train`: campo `seed` (u64, obligatorio) en la config JSON; fuera el `rng()` no determinista (§14.15). Mismo stream para el shuffle por época (consumo secuencial).
      *Hecho si:* dos corridas con la misma seed producen métricas y pesos bit a bit idénticos (nuevo test de determinismo en Rust); `cargo test` verde.
      > Verificado: `test_same_seed_is_deterministic` (outcome serializado idéntico), `test_different_seeds_differ`, `test_seed_is_required`; 56 tests Rust verdes.
- [x] **T2. Errores tipados** — `EngineError` (`thiserror`, §14.18) con variantes `Config/Shape/EmptySplit/Divergence/SoftmaxNotImplemented/Dataset/Unexpected`; pyfunctions devuelven `PyValueError` con prefijo `engine::<código>: <mensaje>`. ~~Migrar `String` → `EngineError` en todo el crate.~~
      > Desviación registrada: el tipado se aplica en la FRONTERA del contrato (`nn_config`); `matrix`/`neural_network` conservan `String` interno y se mapean explícitamente a `Config/Shape/Unexpected` al salir (defensa en profundidad, sin códigos observables desde Python distintos). Migrar los internos no aporta contrato y habría tocado ~45 firmas sin cambio de comportamiento.
      *Hecho si:* `cargo test` verde sin warnings nuevos; los tests antiguos de mensajes esperan el nuevo formato.
      > Verificado: `cargo check --features pyo3/extension-module` sin warnings; smoke Python muestra `engine::empty_split: ...`.
- [x] **T3. Correcciones de contrato** — (a) `process_csv` con `has_headers(false)` (spec 000: CSV puro); (b) alias `tanh` en `Activation::Tanh`; (c) `EmptySplit` cuando la partición train o test queda vacía, comprobado ANTES de entrenar; (d) `SoftmaxNotImplemented` en vez de `todo!()` en el backward.
      *Hecho si:* tests nuevos: CSV sin cabecera entrena con todas las filas (comprueba nº de ejemplos), `tanh` minúscula en config funciona, dataset de 1 fila con split 0,8 → `EmptySplit`, red con capa softmax → error tipado (no pánico).
      > Verificado: `test_process_csv_reads_first_row`, `test_empty_split_is_rejected`, `test_softmax_topology_is_rejected`; fixture `diabetes.csv` sin cabecera (era la única forma de cumplir CSV puro). Softmax se rechaza como pre-chequeo en la frontera (el `todo!()` interno del backward queda como defensa, ya inalcanzable).
- [x] **T4. Métricas honestas de test** — `mse_loss` = media de MSE por ejemplo del test; `r_square` en streaming, sin materializar la matriz de predicciones; `accuracy` = media por ejemplo (binaria umbral 0,5 / argmax multiclase por fila, sin el bug de indexación que daba pánico). Outcome añade `split: {train_rows, test_rows}`.
      *Hecho si:* tests numéricos: XOR/seno/diabetes con semillas fijas dan métricas conocidas coherentes (seno con r² > 0,9 tolerable), y red de salida multicolumna no pánico; `cargo test` verde.
      > Verificado: 56 tests verdes (XOR r²≈0,9993, accuracy 1,0 en smoke). R² por pasada única con Welford (media y M2 incrementales) en vez de dos pasadas: mismo resultado, una sola pasada por el test y estabilidad numérica; MSE con media incremental (evita redondeo por división final). Se elimina el cálculo de test por intervalo de época (se descartaba) y se sustituye por la comprobación de divergencia por época. Bug multiclase de `Accuracy` corregido (`end_index = start + cols`).
- [x] **T5. Predict y verificación de volcado** — `Network::from_send_information` (valida longitudes contra la topología) + `forward_vector`; pyfunctions `predict_json(network_json, x) -> Vec<f32>` y `evaluate_json(network_json, dataset_json) -> métricas`. Re-instalar la extensión.
      *Hecho si:* test Rust: volcado → rebuild → mismas salidas bit a bit; `import engine_core; predict_json(...)` desde Python funciona tras `maturin develop`.
      > Verificado: `test_predict_roundtrip`, `test_predict_rejects_bad_input`, `test_from_send_information_rejects_truncated_weights`, `test_evaluate_json_reproduces_run_metrics` (métricas idénticas bit a bit). Desviación registrada: `evaluate_json` SIN `loss_name` (las métricas son el trío fijo mse/r²/accuracy de la spec; el parámetro sobraba). Smoke Python completo (`SMOKE-BLOCK-A-OK`).

## Bloque B — Entrenamiento one-shot y runs (Django)

- [x] **T6. Modelo `Run` y pesos** — migración: `Network.weights` JSONField null + modelo `Run` (plan §4: `dataset_id` SIN FK + fotografía de stats + métricas Float + created_at orden desc estable). Registro en admin opcional.
      *Hecho si:* `makemigrations networks` genera migración y `manage.py check` pasa.
      > Verificado: migración `0002_network_weights_run` (weights + Run), admin con `RunAdmin`, `check` limpio y suite completa 112 tests OK.
- [x] **T7. Schemas y helpers** — `TrainIn {dataset_id}`, `RunOut {id, mse_loss, r_square, accuracy, dataset: {id, total_rows, input_cols, output_cols}}`; constructor del JSON de config para el motor (mapeo loss `mse→mse_loss`…); estimador de bytes del volcado desde la topología.
      *Hecho si:* unit tests de schemas y del estimador (bordes 50 MB con ×19/float).
      > Verificado: `networks/engine.py` (`build_model_config`, `estimate_dump_bytes` con ×19/float, `parse_engine_error` con prefijo `engine::`, `engine_error_status` 422/500) + schemas `TrainIn/RunOut/RunDatasetOut`; `networks/test_engine.py` (14 tests unitarios, sin DB); suite `networks` 58 tests OK. Límite de volcado `50 * 1024 * 1024` (coherente con el 5 MiB de datasets).
- [x] **T8. Endpoint `POST /networks/{id}/train`** — validaciones secuenciales (plan §5): red y dataset propios (404 uniforme), state (409), compatibilidad de formas (422, RF-7), topes de coste con `epochs × total_rows` del dataset elegido (422, RF-8), marcar `training`, llamada a `engine_core.train_json`, persistencia única final (state `trained` + weights + run) o limpieza (`draft`, sin pesos, sin run en divergencia/split).
      *RF:* RF-3 (respuesta al terminar), RF-4 (201 + run + estado `trained` + pesos), RF-5 (re-entrena y el histórico crece), RF-6 (409), RF-7/8/9/10 (422 con motivo), RF-1/2 (401/404).
      *Hecho si:* tests de red verdadera XOR train con seed fija → métricas en la respuesta; los 6 códigos de error cubiertos; divergencia forzada (lr 100) deja la red en `draft` sin pesos ni run.
      > Verificado: `networks/test_train.py` (17 tests: validaciones puras de topes/forma + 12 endpoint). Divergencia vía API con lr 1 y features 1e6 (lr 100 choca antes con el tope RF-8, como debe): 422 + `draft` + sin pesos/run. Softmax y split vacío también limpian. CSV y JSON entrenan; re-entrenar acumula runs con métricas idénticas (seed fija).
- [x] **T9. Endpoint `GET /networks/{id}/runs`** — listado desc del dueño (plan §5); RF-12 (3 corridas con datasets distintos → orden y contenidos correctos), RF-13 (vacío).
      *Hecho si:* tests del listado + permanencia: borrar el dataset de un run histórico no altera la corrida (RN-4), editar la red no reescribe runs (RN-7).
      > Verificado: `networks/test_runs.py`: vacío, orden desc estable (3 corridas JSON/CSV), snapshot por corrida, RN-4 (borrar dataset deja el run con su snapshot), RN-5 (CASCADE al borrar red), 401/404.
- [x] **T10. Lock y estados en dura** — PATCH sobre `trained` limpia `weights` y deja `draft` (RF-16 parte A); PATCH/DELETE sobre `training` → 409 (RF-11).
      *Hecho si:* tests de ambas transiciones (histórico intacto tras editar, 409 en ambas rutas).
      > Verificado: `test_edit_trained_network_clears_weights_and_keeps_runs` (weights→None, state→draft, runs intactos). 409 de PATCH/DELETE en `training` ya cubiertos en `networks/tests.py` (F5a).

## Bloque C — Predicción y volcado (Django)

- [x] **T11. Endpoint `POST /networks/{id}/predict`** — state ≠ `trained` → 409 (RF-18); vector: longitud = primera capa, todos finitos, si no 422 (RF-19); llamada a `predict_json`, respuesta `{"output": [...]}` (RF-17).
      *Hecho si:* tests: vector correcto → salida de longitud última capa con valores esperados contra los de Rust; longitudes/NaN/texto → 422; red `draft` → 409.
      > Verificado: `networks/test_predict_weights.py` (7 tests de predict: 200 con salida, draft 409, trained sin pesos 409, longitud 422, NaN 422, ajeno 404, sin token 401). e2e real PASS 9/14/15.
- [x] **T12. Endpoint `GET /networks/{id}/weights`** — volcado completo `{config, network}` (RF-14) con la verificación de igualdad vía `evaluate_json` en el test (reconstruido en el sistema, métricas idénticas al run); 413 dos capas cuando el volcado supera 50 MB (RF-15: primero estimación, luego medición real); 409 si no `trained`.
      *Hecho si:* tests: volcado de red pequeña contiene semilla+config+pesos y reproduce métricas igual al run; 413 por estimación con red monstruo sintética; 409 en `draft` post-edición (RF-16 parte B).
      > Verificado: 6 tests de weights (volcado con config+12 pesos+5 biases; roundtrip `predict_json(dump) == predict API` exacto en 3 vectores + `evaluate_json` corre; draft 409; ajeno 404; 413 estimado con 2–2048–2048; 413 real con constantes parcheadas). **Desviación:** la igualdad exacta con las métricas del run no es realizable: el run mide sobre el split de test y `evaluate_json` evalúa el dataset completo, sin exponer el split elegido. Se sustituyó por la verificación más fuerte y exacta de que los pesos volcados reproducen las predicciones, más una corrida de `evaluate_json`.

## Bloque D — RNF, e2e y cierre

- [x] **T13. Rendimiento** — añadir a `core/perf.py` (fuera de la suite general): RNF-3 (listado de runs con 100 corridas < 200 ms p95); benchmark RNF-1 con la referencia aprobada en la enmienda (5 000 filas × 7 columnas × 1 000 epochs = 5 000 000 pasos legales, seed fija, `maturin develop --release`) y umbral < 5 minutos (p95); registro del número real.
      *Hecho si:* números impresos y dentro de umbral (o desviación documentada aquí con propuesta: Rayon §14.17 o recalibrado).
      > Resultados (release, `manage.py test core.perf`): [RNF-3/001] runs_list_p95 **18,0 ms** ✓; [RNF-1/001] referencia 5 000 filas × 7 cols × 1 000 epochs → **124 815 ms (2 min 5 s)** ✓ con mse 3,6e-13 y r² 1,0, idénticos a la medición previa; dataset_setup 99,5 ms. F5a sigue verde (list 25,0 ms; upload 4,41 MB 454,0 ms; fetch 39,4 ms). Medición inicial de la misma referencia: 334 689 ms ✗ (11,6 % sobre el umbral). **Resuelto por decisión del dueño (optimizar el lazo escalar, no Rayon):** bench reproducible `engine-core/tests/train_bench.rs` (7-64-64-1, seed fija, `#[ignore]`) pasó de **126,2 → 27,6 µs/paso (4,6×)** con error final bit a bit idéntico. Cambios: matmul especializado para vector columna en `Matrix::multiply`/`transpose_multiply` (elimina 4 096 iteraciones de slice de longitud 1 por capa oculta), backward sin trasposiciones materializadas (`multiply_transposed`/`transpose_multiply`), activación ReLU/tanh/sigmoid aplicada in-place, bias sumado in-place y update de pesos/bias in-place (`add_bias_in_place`, `map_in_place`, `sub_scaled_in_place`). Sin cambios de aritmética ni de orden de suma: los 56 tests Rust siguen verdes y la convergencia de XOR/seno/diabetes no cambió.
- [x] **T14. Pasada e2e con servidor real** — register/login → crear red + dataset → train (201 + run) → predict → volcado → runs → editar → re-entrenar → **reinicio del servidor → RF-20** (estado `trained`, pesos, volcado y runs sobreviven). Apuntar desviaciones.
      > Resultados: `e2e_f5b.py` (runserver real 127.0.0.1:8012, `--noreload`) **19/19 PASS**, termina `E2E-F5B-OK`: 401 sin token; train 201 (mse 0,003002, r² 0,987192, acc 1,0, split 32 filas); runs 1→2 tras re-entrenar; predict [0,1] ≈1; volcado 12 pesos + 5 biases; **reinicio del servidor → predict y runs persisten (RF-20)**; editar trained → draft + 409 en predict/weights con histórico intacto; longitud errónea/NaN 422; softmax 422 y red limpiada; dataset ajeno 404; borrar dataset no toca runs (RN-4); borrar red 204→404. Incidencias resueltas: la migración 0002 no estaba aplicada en la DB de dev (los tests usan DB propia); Docker/Redis estaba caído y se arrancó (`synforja-redis`, §14.23).
- [x] **T15. Cierre de la fase 001** — `manage.py check` + `manage.py test` + `cargo test` todo verde; resumen §2 (qué/cómo/se verifica); AGENTS.md §12 y §14 actualizados (contrato del motor: seed, errores tipados, predict).
      > Cierre verificado: `manage.py check` sin issues; `manage.py test` **160 tests OK** (~4 s); `cargo test` **56 OK** sin warnings (~14 s post-optimización); `core.perf` 4/4 OK (RNF-1 127,1 s ✓, RNF-3 18,0 ms ✓); e2e real 19/19. AGENTS §8/§9/§10/§12/§14 actualizados (§14.15 seed, §14.17 Rayon aplazado y sustituido por optimización escalar, §14.18 thiserror parcial, §14.26 cierre F5b). Spec 001 RNF-1 se cumple sin enmienda adicional.

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
