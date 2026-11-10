# Plan 002 — Progreso del entrenamiento en vivo (streaming SSE)

> Implementación de `specs/002-streaming-del-entrenamiento/spec.md` (aprobada 08-11-2026).
> Este documento es el CÓMO. Requiere el bloque A del plan 001 ya hecho (comparte el núcleo de entrenamiento, la semilla y los errores tipados).

## 1. Enfoque

- La petición de entrenamiento **emite el stream como su respuesta** (SSE): un iterador perezoso donde cada tirón avanza UNA época en el motor. Sin threads de fondo ni servicios nuevos (constitución: entrenamiento síncrono; el stream ES la respuesta).
- **Enmienda 10-11-2026:** el stream es un **generador async** servido por ASGI (uvicorn). La vista `train_network` es `async def`; ORM con `sync_to_async(thread_sensitive=True)` y cada época con `sync_to_async(LiveTrainer.next_epoch, thread_sensitive=False)` (el hilo se libera entre épocas y el motor suelta el GIL dentro de cada llamada). El one-shot conserva contrato y ahora también calcula fuera del hilo del event loop. `LiveTrainer` pasó de `unsendable` a `Send + Sync` (Matrix con `Arc`, `LossFn` con `+ Send + Sync`).
- Negociación de modalidad: la MISMA ruta `POST /api/networks/{id}/train`. SI `Accept: text/event-stream`, ENTONCES el handler devuelve `StreamingHttpResponse` con eventos; de lo contrario conserva el one-shot de la 001 intacto (RF-5 de 002).
- Reuso estricto: el núcleo de entrenamiento (config + datos + split + shuffle + métricas) es UNA pieza compartida; one-shot = iterar todo de tirón; streaming = iterar época a época. RN-3 de la 002 (equivalencia de métricas) se verifica por test.

## 2. Motor Rust: `LiveTrainer` (iterador perezoso)

Fichero nuevo `engine-core/src/nn_config/live_trainer.rs`; el núcleo común se refactoriza desde `create_and_train` a una estructura `TrainingCore` (config, datos, split, rng ChaCha8, red actual). El one-shot `create_and_train` pasa a consumir el core en bucle.

```rust
#[pyclass]
pub struct LiveTrainer {
    core: TrainingCore,
    epochs_planned: usize,   // = config.epochs
    epoch_done: usize,       // n-ésima época completada
    finished: bool,
}

#[pymethods]
impl LiveTrainer {
    #[new] fn new_from_json(model_data: String, training_data_json: String) -> PyResult<Self>;
    #[new] fn new_from_csv(model_data: String, csv: String, input_columns: usize) -> PyResult<Self>;

    fn start_info(&self) -> PyResult<String>;   // {epochs, train_rows, test_rows} — evento de arranque (RF-2)
    fn next_epoch(&mut self) -> PyResult<Option<String>>;  // {epoch, loss_train, loss_test} — None al agotar
    fn result(&self) -> PyResult<String>;       // outcome one-shot; error si no se agotó la iteración
}
```

(dirección de serialización igual que la ya usada: `serde_json::to_string` de structs `Serialize`.)

- `next_epoch` ejecuta EXACTAMENTE una época: shuffle con el mismo stream, SGD ejemplo a ejemplo con media de la pérdida de entrenamiento de la época acumulada al vuelo, y al cierre eval del test con la función de pérdida configurada (media). Aquí NO existe `test_interval`: la spec exige TODAS las épocas. Divergencia al final de la época → `PyValueError("engine::divergence: ...")` (RF-7 de 002).
- Coste: la eval de test por época es ~20% del paso (RNF-2 de la spec: ≤ 2× one-shot, de sobra). La 001 one-shot NO evalúa test por época (no la necesita); la 002 sí: flag `eval_test_each_epoch` en el core — NO toca la secuencia del rng (la eval no consume aleatoriedad) → pesos idénticos entre modalidades (RN-3).
- `result()` solo se sirve agotada la iteración (después del último `None`); devuelve el mismo `TrainingOutcome` del one-shot (mismas métricas, pesos y split).
- Registro en el módulo `_engine`: `m.add_class(LiveTrainer)`.

- **Tests Rust (cargo)**: iterador con la misma seed → métricas idénticas bit a bit al one-shot (RN-3); nº de tiradas = epochs y la última devuelve None; series con valores finitos y nº de época ascendentes sin saltos; divergencia en época N → error tipado al tirar; `start_info` exacto (épocas y particiones reales del split).

## 3. Puente Python

- `python/engine_core/__init__.py` exporta además `LiveTrainer`. Tras cada cambio del crate: `cmd /c ".venv\Scripts\maturin.exe develop"`; con `--release` para medir RNFs.

## 4. Django: streaming (backend/networks)

- **Handler** (`backend/networks/api.py`): la validación del train es común a ambos modos (`_validate_train_request`): red y dataset propios (404 uniforme), state (409, RF-6/RF-10), compatibilidad de formas (RF-9 de 002 → error one-shot SIN abrir stream), topes de coste (RF-8 de 001 con las filas del dataset elegido; presupuesto epochs × rows ≤ 5 000 000). Después:
  - one-shot → la tarea T8 de la 001 (sin cambios de contrato).
  - stream → comprobar state ≠ `training`, guardar el estado/pesos previos, marcar `training` (persistido) y devolver `StreamingHttpResponse` (`text/event-stream`) con un **generador async** que:
    1. Emite `event: start` con `{epochs, train_rows, test_rows}` (RF-2).
    2. Tira `await sync_to_async(trainer.next_epoch, thread_sensitive=False)()` por cada época (el hilo se libera entre épocas; el motor suelta el GIL dentro de la llamada) y emite `event: epoch` con `{epoch, loss_train, loss_test}` (RF-3: ascendente 1..N sin saltos, verificado antes de emitir).
    3. Al agotar: persistencia única (state `trained` + weights + run, la MISMA rutina del one-shot) con `sync_to_async(..., thread_sensitive=True)` y emite `event: final` con el run completo (mismo cuerpo que la 001, RF-4 de 002).
    4. Errores del motor a mitad (divergencia/unexpected): emite `event: error` con `{code, message}` y termina con limpieza (sin pesos ni run; `draft` en divergencia, estado/pesos previos en unexpected, RF-7/RF-8 de 002).
    5. Al cerrarse el generador (`GeneratorExit` o `CancelledError`, cliente desconectado): limpieza `draft`, sin pesos, sin run (RF-6 de 002). NADA queda persistido a medias. La cancelación se aplica al terminar la época en curso (el motor no se interrumpe a mitad de época).
- **Wire (SSE)**: cada evento = `event: <tipo>\ndata: <json en una línea>\n\n`; tipos `start | epoch | final | error`, con el payload como único campo `data` (JSON bytes UTF-8).
- Lock de concurrencia (RF-10 de 002): el state `training` se escribe en DB AL ARRANCAR (tras validar) → cualquier segunda petición de train (cualquier modo) choca con el check de estado y devuelve 409; PATCH/DELETE también (RF-11 de 001).
- Sin soporte de resumen/reconexión (fuera de alcance): el endpoint no guarda ningún estado de sesión; el cierre del generador lo deja todo limpio.
- Auth/aislamiento heredados del router (`JWTAuth`, `get_own_or_404`); throttling global intacto (el stream es UNA petición de auth).
- **ASGI obligatorio para streaming:** uvicorn (`py -m uvicorn core.asgi:application`); bajo WSGI Django rechaza iteradores async. El one-shot funciona en ambos servidores. ORM de la vista con `thread_sensitive=True`; motor con `thread_sensitive=False`. `LiveTrainer` es `Send + Sync` (Matrix con `Arc`, `LossFn + Send + Sync`) y sus métodos liberan el GIL con `Python::detach`.

## 5. Tests (constitución #4)

- **Corrida feliz**: iterar `response.streaming_content` y decodificar frames: exactamente `1 + epochs + 1` eventos (start + epoch×N + final), en orden, nº de época 1..N consecutivos; `final` con run completo y coherente con `GET /networks/{id}/runs` (RF-3/RF-4).
- **Cancelación**: leer 3 eventos y `await iterator.aclose()` (simula desconexión) → state = `draft`, 0 runs nuevos, sin pesos (RF-6).
- **Divergencia a mitad**: lr 1.0 con entradas 1e6 y 4 filas de train por época → evento `error` con código, stream cerrado, limpieza aplicada (RF-7).
- **Error no previsto**: `make_trainer` parcheado con un trainer que falla → `error` + estado/pesos previos a la corrida (RF-8).
- **Validación rechazada con stream pedido**: red 3→1 contra dataset `input_cols=2` con `Accept: text/event-stream` → respuesta de error one-shot (422), SIN stream abierto (RF-9).
- **RF-10**: state `training` fijado a mano → segunda petición (ambos modos) → 409; PATCH/DELETE → 409.
- **RF-5**: misma petición con/sin el header Accept → one-shot intacto; métricas y pesos same-seed one-shot vs stream idénticos (RN-3).
- **RF-12**: tras un stream exitoso, GET runs devuelve 1 corrida con métricas finales SIN series por época (nada del stream persiste la curva).
- **RF-11**: cerrar el stream no deja ruta ni consulta para "estado de suscripción" (no existen: comprobar por suite).
- Fixture del motor: red pequeña XOR (cada test de corrida tarda < 1 s) para no alargar la suite.
- **Infra de tests async**: los tests del stream usan `ApiTransactionTestBase` (`TransactionTestCase`, sin transacción envolvente: las escrituras de limpieza/persistencia corren en hilos del executor) y consumen el generador con `async_to_sync` + `async for`/`aclose`.

## 6. Riesgos / decisiones del plan

- Cada tirón de época es bloqueante: una época grande (50k filas) puede tardar minutos EXACTAMENTE lo que decidió el dueño (sin tope de reloj); el RNF-1 de la spec ata la cadencia a la corrida de referencia, no al peor caso legal.
- SSE sobre WSGI (`runserver`): funciona en dev multihilo; retiene un worker durante la corrida (aceptado: sync).
- La equivalencia entre modalidades no es un accidente: `TrainingCore` con `eval_test_each_epoch` — el flag no altera el consumo del rng, y el RNF-2 (≤ 2×) absorbe el coste añadido.
- persistencia: ocurre SOLO en el paso final del stream o en la limpieza; NUNCA a mitad de época.
- Cancelar EXACTAMENTE tras el evento final = corrida ya cerrada con éxito (el run existe; la cancelación solo aplica antes del final).
- Medición de RNFs con `maturin develop --release` y la corrida de referencia aprobada en la enmienda de la 001 (08-11-2026): carga siempre dentro del presupuesto legal; para cadencia estable se mide con la config de referencia pequeña (5 000 filas × 1 000 epochs), no con el peor caso legal.
