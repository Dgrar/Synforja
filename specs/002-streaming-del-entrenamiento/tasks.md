# Tasks 002 — Progreso del entrenamiento en vivo (streaming SSE)

> Ejecución de `plan.md` contra `spec.md`. Cada tarea termina con sus tests en verde (constitución #4).
> Marca `[x]` al completar; no avances de bloque con tests rojos.
> Precondición: bloque A de `specs/001-entrenamiento-y-prediccion/tasks.md` completado (compartimos núcleo, semilla y errores).

## Bloque A — Iterador del motor (Rust + PyO3)

- [ ] **T1. `TrainingCore`** — refactor del núcleo de `create_and_train` a `TrainingCore` (config+seed+datos+split+rng) consumido por el one-shot en bucle (mismo resultado que hoy: `cargo test` idéntico verde).
      *Hecho si:* sin cambios de comportamiento (salvo los ya hechos en 001); suite Rust completa verde.
- [ ] **T2. `LiveTrainer`** — pyclass con `new_from_json/new_from_csv`, `start_info()`, `next_epoch() -> Option<json>{epoch, loss_train, loss_test}` (UNA época por tirada, eval de test cada época con la loss de config), `result()` (outcome igual al one-shot); divergencia → error tipado por tirada; registro `m.add_class` + re-instalación (`maturin develop`).
      *Hecho si:* tests Rust: misma seed → mismas métricas que el one-shot bit a bit (RN-3); nº de tiradas = epochs; `start_info` correcto; divergencia tipada; wrapper expone `LiveTrainer` en Python.
- [ ] **T3. Equivalencia de modalidades en Python** — prueba de integración del wrapper: one-shot vs trainer iterado con la misma seed y dataset → métricas idénticas y pesos idénticos.
      *Hecho si:* `maturin develop` OK y comprobación manual en la REPL de Python (`LiveTrainer` importable y tiradas 1..N). La equivalencia formal one-shot vs iterado se verifica en el bloque B (T5, RF-5 de la spec) sobre la suite de Django.

## Bloque B — Streaming en Django

- [ ] **T4. Negociación de modalidad + validación común** — extraer `_validate_train_request` (404/409/compatibilidad/topes, igual que T8 de 001); SI `Accept: text/event-stream` → ruta streaming; ELSE → one-shot intacta (RF-5, RF-9 de 002: error de validación one-shot aunque se pida stream).
      *Hecho si:* tests: misma validación responde 422 plano en ambos modos; `Accept` sin stream mantiene el contrato 001 byte a byte.
- [ ] **T5. Generador SSE** — generator emite `start` → `epoch`×N → persistencia única final (state `trained` + weights + run, MISMA rutina que one-shot) → `final` con el run; formato wire `event: <tipo>\ndata: <json>\n\n`.
      *RF:* RF-1, RF-2, RF-3, RF-4 (de 002).
      *Hecho si:* suite tests: para una red XOR pequeña de N épocas: exactamente N+2 eventos en orden, nºs 1..N consecutivos; `final` coherente con `GET runs`.
- [ ] **T6. Cancelación por desconexión** — `GeneratorExit`: limpieza state→`draft`, sin pesos, sin run; SOLO si ocurre antes del `final`.
      *RF:* RF-6. *Hecho si:* test que lee 3 eventos y cierra el iterador → sin run nuevo, `draft`, sin pesos; corrida completa → run intacto.
- [ ] **T7. Errores a mitad de stream** — divergencia/unexpected del motor → evento `error` `{code, message}` + limpieza (draft / estado previo, sin pesos ni run); validación rechazada NO abre stream ya cubierto en T4 (RF-9).
      *RF:* RF-7, RF-8. *Hecho si:* tests: lr 100 → `error` + limpieza; fallo interno simulado → estado previo.
- [ ] **T8. Concurrencia y sin estado de sesión** — 409 para segunda petición mientras `training` (ambos modos) + PATCH/DELETE 409 (RF-10, RF-11 de 001); ninguna ruta de suscripción/sesión después del cierre (RF-11); runs SIN series (RF-12).
      *Hecho si:* tests de los 3 chequeos.

## Bloque C — RNF, e2e y cierre

- [ ] **T9. Rendimiento del stream** — añadir a `core/perf.py` (etiqueta streaming, fuera de la suite general, `maturin --release`): RNF-1 cadencia (1.er evento y huecos ≤ 10 s en la corrida de referencia), RNF-2 (stream ≤ 2× one-shot mismo config), RNF-3 (stream 10 000 épocas < 2 MB medido).
      *Hecho si:* números impresos y dentro de umbral; desviaciones documentadas aquí.
      > Resultados: (pendiente de ejecución)
- [ ] **T10. Pasada e2e con servidor real** — train en modo streaming con `curl -N` (header Accept + token): observar start/epoch/final en vivo; cortar la conexión a mitad (Ctrl-C del curl) y verificar sin run/draft; re-entrenar one-shot y comparar métricas (RN-3). Apuntar desviaciones.
      > Resultados: (pendiente de ejecución)
- [ ] **T11. Cierre de F5b** — `manage.py check` + `manage.py test` + `cargo test` verde; resumen §2 (qué/cómo/se verifica); AGENTS.md §12: F5b → HECHA (001+002); §14 con las decisiones de motor (TrainingCore/LiveTrainer, wire SSE, evaluación de test por época).
      > Resultados: (pendiente de ejecución)

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
