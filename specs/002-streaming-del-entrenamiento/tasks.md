# Tasks 002 — Progreso del entrenamiento en vivo (streaming SSE)

> Ejecución de `plan.md` contra `spec.md`. Cada tarea termina con sus tests en verde (constitución #4).
> Marca `[x]` al completar; no avances de bloque con tests rojos.
> Precondición: bloque A de `specs/001-entrenamiento-y-prediccion/tasks.md` completado (compartimos núcleo, semilla y errores).

## Bloque A — Iterador del motor (Rust + PyO3)

- [x] **T1. `TrainingCore`** — refactor del núcleo de `create_and_train` a `TrainingCore` (config+seed+datos+split+rng) consumido por el one-shot en bucle (mismo resultado que hoy: `cargo test` idéntico verde).
      *Hecho si:* sin cambios de comportamiento (salvo los ya hechos en 001); suite Rust completa verde.
      > Resultado (10-11-2026): `TrainingCore` en `nn_config/json_to_nn.rs` (`new(model_data, source, eval_test_each_epoch)`, `epochs/train_rows/test_rows/epoch/outcome`); `create_and_train` solo parsea y recorre `epoch`. El shuffle pasó a mezclar `Vec<usize>` de índices: mismo consumo de RNG y misma permutación que antes (equivalencia bit a bit verificada en T2). 62 tests Rust verdes.
- [x] **T2. `LiveTrainer`** — pyclass con `new_from_json/new_from_csv`, `start_info()`, `next_epoch() -> Option<json>{epoch, loss_train, loss_test}` (UNA época por tirada, eval de test cada época con la loss de config), `result()` (outcome igual al one-shot); divergencia → error tipado por tirada; registro `m.add_class` + re-instalación (`maturin develop`).
      *Hecho si:* tests Rust: misma seed → mismas métricas que el one-shot bit a bit (RN-3); nº de tiradas = epochs; `start_info` correcto; divergencia tipada; wrapper expone `LiveTrainer` en Python.
      > Resultado (10-11-2026): `nn_config/live_trainer.rs` con helpers puros `start_info_json/next_epoch_json/result_json` (testeables sin GIL) y métodos PyO3 finos; registro en `lib.rs` y export en `python/engine_core/__init__.py`. Desviaciones: (a) PyO3 admite un solo `#[new]` → `#[new]` `(model, data, input_columns=None)` + `#[staticmethod] new_from_json/new_from_csv`; (b) `#[pyclass(unsendable)]` porque `Network` usa `Rc` y `LossFn` no es `Send` (el trainer vive y se consume en el hilo que lo crea). Tests nuevos (6): start_info 25/12/4, épocas 1..N en orden, resultado iterado **idéntico byte a byte** al one-shot (JSON y CSV), `result()` antes de agotar → `engine::config`, divergencia tipada `Divergence(1)` (caso: 4 filas de train por época que desbordan los pesos dentro de la misma época, antes de la eval de test), CSV aceptado.
- [x] **T3. Equivalencia de modalidades en Python** — prueba de integración del wrapper: one-shot vs trainer iterado con la misma seed y dataset → métricas idénticas y pesos idénticos.
      *Hecho si:* `maturin develop` OK y comprobación manual en la REPL de Python (`LiveTrainer` importable y tiradas 1..N). La equivalencia formal one-shot vs iterado se verifica en el bloque B (T5, RF-5 de la spec) sobre la suite de Django.
      > Resultado (10-11-2026): `maturin develop` OK; smoke `smoke_live_trainer.py` PASA: `start_info` 25/12/4, 25 tiradas 1..25 con losses finitas, `result == train_json` (JSON) y `== train_csv` (CSV), constructor directo, `result()` prematuro → `engine::config`, divergencia → `engine::divergence`; firma `SMOKE-LIVE-TRAINER-OK`.

## Bloque B — Streaming en Django

- [x] **T4. Negociación de modalidad + validación común** — extraer `_validate_train_request` (404/409/compatibilidad/topes, igual que T8 de 001); SI `Accept: text/event-stream` → ruta streaming; ELSE → one-shot intacta (RF-5, RF-9 de 002: error de validación one-shot aunque se pida stream).
      *Hecho si:* tests: misma validación responde 422 plano en ambos modos; `Accept` sin stream mantiene el contrato 001 byte a byte.
      > Resultado (10-11-2026): `_validate_train_request` en `api.py`; la vista pasó a `async def` (ORM con `sync_to_async(thread_sensitive=True)`, una sola ruta). Diferencia deliberada: la vista es async (decisión de arquitectura), la validación y contrato one-shot son idénticos; en `test_stream.py` se comprueba 422 plano con `Accept: text/event-stream` (sin stream) y one-shot 201/application-json intacto.
- [x] **T5. Generador SSE** — generator emite `start` → `epoch`×N → persistencia única final (state `trained` + weights + run, MISMA rutina que one-shot) → `final` con el run; formato wire `event: <tipo>\ndata: <json>\n\n`.
      *RF:* RF-1, RF-2, RF-3, RF-4 (de 002).
      *Hecho si:* suite tests: para una red XOR pequeña de N épocas: exactamente N+2 eventos en orden, nºs 1..N consecutivos; `final` coherente con `GET runs`.
      > Resultado (10-11-2026): `streaming.py` con async generator; wire verificado en `test_stream_emits_start_epochs_and_final` (5+2 eventos, 1..5, start 5/12/4, `final` == GET runs) y `test_stream_csv_dataset`; persistencia vía `service.persist_outcome` (misma rutina del one-shot). `Cache-Control: no-cache` + `X-Accel-Buffering: no`.
- [x] **T6. Cancelación por desconexión** — `GeneratorExit`: limpieza state→`draft`, sin pesos, sin run; SOLO si ocurre antes del `final`.
      *RF:* RF-6. *Hecho si:* test que lee 3 eventos y cierra el iterador → sin run nuevo, `draft`, sin pesos; corrida completa → run intacto.
      > Resultado (10-11-2026): `test_cancellation_resets_to_draft_without_run` (3 frames + `aclose()`): draft, sin pesos, 0 runs; el generador atiende `GeneratorExit`/`CancelledError`. Límite documentado: la cancelación surte efecto al cerrar la época en curso (el motor Rust no es interrumpible a mitad de época).
- [x] **T7. Errores a mitad de stream** — divergencia/unexpected del motor → evento `error` `{code, message}` + limpieza (draft / estado previo, sin pesos ni run); validación rechazada NO abre stream ya cubierto en T4 (RF-9).
      *RF:* RF-7, RF-8. *Hecho si:* tests: lr 100 → `error` + limpieza; fallo interno simulado → estado previo.
      > Resultado (10-11-2026): `test_divergence_emits_error_and_stays_draft` (lr 1.0 y 4 filas de train por época: error en época 1 → draft, 0 runs) y `test_unexpected_engine_error_restores_previous_state` (trainer simulado: `unexpected` + estado/pesos previos intactos, 0 runs). Nota: lr 100 no pasa la validación one-shot (tope lr ≤ 1), por eso la divergencia se fuerza con 1e6.
- [x] **T8. Concurrencia y sin estado de sesión** — 409 para segunda petición mientras `training` (ambos modos) + PATCH/DELETE 409 (RF-10, RF-11 de 001); ninguna ruta de suscripción/sesión después del cierre (RF-11); runs SIN series (RF-12).
      *Hecho si:* tests de los 3 chequeos.
      > Resultado (10-11-2026): `test_second_request_while_training_is_409_in_both_modes` (one-shot y stream, JSON plano); PATCH/DELETE 409 ya cubiertos en `tests.py` (`test_patch_training_locked`, `test_delete_training_locked`); runs sin series verificado en T5 (`set(body) == {id, mse_loss, r_square, accuracy, dataset}`) y no existe ruta de sesión/suscripción.

## Bloque C — RNF, e2e y cierre

- [x] **T9. Rendimiento del stream** — añadir a `core/perf.py` (etiqueta streaming, fuera de la suite general, `maturin --release`): RNF-1 cadencia (1.er evento y huecos ≤ 10 s en la corrida de referencia), RNF-2 (stream ≤ 2× one-shot mismo config), RNF-3 (stream 10 000 épocas < 2 MB medido).
      *Hecho si:* números impresos y dentro de umbral; desviaciones documentadas aquí.
      > Resultados (11-11-2026, `maturin develop --release`): RNF-1 `first_epoch_ms` **119,8 ms** y `epoch_gap_p95_ms` **142,8 ms** (umbral 10 s); RNF-2 stream **116 051,3 ms** vs one-shot **97 476,2 ms** → **1,19×** (umbral 2×); RNF-3 **920 609 B** y 4,6 s para 10 000 épocas (umbral 2 MB). Bench `core.perf.StreamingPerformanceTests` (`ApiTransactionTestBase`, fuera de la suite general). Desviación: con `maturin develop` debug el one-shot de referencia sube a ~1 139 s (≈9×); los RNF solo son válidos con build release, y el bench debe correrse sin otras cargas de CPU.
- [x] **T10. Pasada e2e con servidor real** — train en modo streaming con `curl -N` (header Accept + token): observar start/epoch/final en vivo; cortar la conexión a mitad (Ctrl-C del curl) y verificar sin run/draft; re-entrenar one-shot y comparar métricas (RN-3). Apuntar desviaciones.
      > Resultados (11-11-2026): e2e real ASGI/uvicorn (`:8013`) **30/30 PASS** (`E2E-STREAMING-OK`): secuencia `start` + 8 `epoch` + `final` en vivo, `final` == GET runs, stream == one-shot (métricas y pesos), 409 en segunda petición (estado `training` visible durante el stream), cancelación explícita → `draft` sin run ni pesos, divergencia → evento `error` con código `divergence` y `draft`, validación 422 JSON sin abrir stream. Desviación: cliente Python `requests` con lector en hilo en lugar de `curl -N`; romper el iterador sin `close()` cierra el socket y dispara la limpieza antes de comprobar el 409, así que el e2e debe leer en continuo y cerrar explícitamente.
- [x] **T11. Cierre de F5b** — `manage.py check` + `manage.py test` + `cargo test` verde; resumen §2 (qué/cómo/se verifica); AGENTS.md §12: F5b → HECHA (001+002); §14 con las decisiones de motor (TrainingCore/LiveTrainer, wire SSE, evaluación de test por época).
      > Resultados (11-11-2026): `manage.py check` OK; `manage.py test` **168/168 OK**; `cargo test` **62/62 OK** (1 bench ignorado). AGENTS §12 F5b HECHA (001+002), §8 y §14.27 actualizados con wire SSE, async/uvicorn y números RNF.

## Matriz RF → tarea

| RF | Tarea |
|----|-------|
| 1, 2 | T4, T5 |
| 3 | T5 |
| 4 | T5 |
| 5 | T4, T5 (equivalencia) |
| 6 | T6 |
| 7, 8 | T7 |
| 9 | T4 |
| 10 | T8 |
| 11 | T8 |
| 12 | T8 |
| RNF-1/2/3 | T9 |
