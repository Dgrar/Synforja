# AGENTS.md — Synforja

> Fuente única de verdad del proyecto, para agentes de IA **y** para el humano.
> Debe mantenerse entre ~100 y ~300 líneas. Si algo supera ese tamaño, se va a un doc aparte y aquí solo queda el puntero.

## 1. Qué es Synforja
Web **full-stack** que ofrece una alternativa **no-code** para diseñar, entrenar y ejecutar
**redes neuronales simples** (MLP / feed-forward). El usuario arma el grafo en el navegador
(capas, neuronas, activaciones, hiperparámetros), Synforja lo valida, lo entrena y
devuelve métricas y predicciones — sin que el usuario escriba código.

El **cálculo pesado** (matmul, forward pass, backpropagation, descenso de gradiente) vive
en **Rust** (`engine-core`) y se expone a **Python** vía **PyO3**; Django solo orquesta.

## 2. Contrato pedagógico (NO NEGOCIABLE)
El humano debe **entender cada concepto NO-frontend** que se implemente. No se acepta "caja negra".

- Antes o al cerrar cada pieza no trivial, explicar **qué problema resuelve** y **por qué**.
- Cuando aparezca matemática (matmul, derivada de la pérdida, regla de la cadena, update de
  pesos), se **deriva el paso** y se muestra un **ejemplo numérico mínimo**.
- Definir el vocabulario la primera vez que se usa (tensor, batch, época, learning rate, bias…).
- Al terminar cada fase: resumen "qué construimos / cómo funciona / cómo se verifica".
- Interrupción en cualquier momento con "para y explícame esto".
- **Excepción explícita:** **frontend/UX** puede implementarse sin explicación teórica.

## 3. Idioma y estilo
- Documentación, commits y explicaciones: **español**. Identificadores de código: **inglés**.
- Respuestas concisas; sin relleno ni resúmenes redundantes.
- Nada de comentarios en el código salvo que aporten algo no obvio.

## 4. Stack y decisiones (LOCKED salvo propuesta explícita)
| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript, Node 22 LTS | por FIJAR (F6 scaffoldea) |
| API | Django + Django Ninja | Django 6.1.2 · django-ninja 1.7.1 |
| Auth | JWT (django-ninja-jwt) | 5.4.5 |
| Validación | Pydantic v2 | 2.14.1 |
| Motor numérico | Rust (crate `engine-core`) | edition 2021 |
| Precisión numérica | `f32` (fijo) | — |
| Puente Python↔Rust | PyO3 + maturin | pyo3 0.30.1 · maturin 1.16.0 |
| Aleatoriedad Rust | rand + rand_chacha (ChaCha8) | rand 0.10.3 · rand_chacha 0.10.0 |
| Serialización Rust | serde / serde_json / csv | serde 1.0.229 · csv 1.4.0 |
| Errores Rust | thiserror | 2.0.1 (declarado, refactor pendiente, §14.18) |
| Runtime Python | CPython 3.14.4 (`.venv/`) | — |
| Servidor ASGI (SSE) | uvicorn (dev; ASGI obligatorio para streaming) | 0.54.0 (§14.27) |
| Cache / rate-limit | Redis (Django `RedisCache`, `redis://127.0.0.1:6379/1`) | redis-py 8.1.0 (§14.13) |
| Email en Pydantic | email-validator 2.3.0（req. de `EmailStr`) | 2.3.0 |
| Task runner | `rav` (ver `rav.yaml`) | 0.4.3 |
| Entorno | Windows / PowerShell | — |

Reglas: no cambiar de librería sin justificarlo en §14. Preferir lo ya instalado.

## 5. Estructura del repo (actual)
```
Synforja/
├── AGENTS.md, README.md, rav.yaml, pyproject.toml
├── .venv/                 # CPython 3.14 + Django, Ninja, JWT, Pydantic, maturin, rav, uvicorn
├── docs/memory/constitution.md   # principios innegociables (spec-driven)
├── backend/               # Django 6.1.2
│   ├── core/              # settings, urls, api (NinjaAPI + throttling), asgi (uvicorn), perf
│   ├── users/             # register/login JWT, schemas, rate-limiting (auth.py)
│   ├── datasets/          # CRUD de datasets (JSON/CSV, validación Pydantic)
│   └── networks/          # CRUD, train (one-shot + SSE async), predict, runs, weights
├── engine-core/           # crate Rust (cdylib para Python)
│   └── src/               # matrix/, neural_network/, nn_config/
├── python/engine_core/    # wrapper Python + _engine.pyd (maturin mixed)
└── frontend/              # pendiente (F6)
```

## 6. Arquitectura y fronteras
```
Next.js (auth JWT) ──HTTP/JSON──▶ Django Ninja (API, validación Pydantic)
                                          │
                                          ▼
                                   Python orquestador ──PyO3──▶ engine-core (Rust)
                                   (persistencia, JWT, métricas) (matmul, forward, backprop)
```
Regla de dependencia: **el frontend nunca calcula**; **Django nunca hace matemática de red**;
**Rust nunca conoce HTTP, DB ni modelos de Django**. Cada frontera habla con un contrato claro.

## 7. Modelo de dominio (borrador)
- `Network` — id, nombre, tipo (`MLP`), estado (`draft|training|trained`).
- `Layer` — índice, nº de neuronas, activación (`relu|sigmoid|tanh|softmax|linear`).
- `TrainingConfig` — epochs, learning_rate, loss (`mse|bce|mae`), training_split, **seed** (obligatoria, §14.15). **Sin batch_size** (§14.16).
- `Run` — métricas de test: mse_loss, r_square, accuracy.
- `Dataset` — filas de features + etiquetas, en **JSON o CSV**, validado con Pydantic.

Pesos inicializados **He** (ReLU) / **Xavier** (resto). `Network` + `TrainingConfig`
serializables a JSON y reconstruibles de forma determinista: es el contrato que cruza
todas las fronteras (hoy: `train_json` acepta topología+hiperparámetros y devuelve pesos).

## 8. API (borrador, en construcción)
Spec-driven: **spec 000 aprobada** en `specs/000-spec-crud-redes-datasets/` (spec+plan+tasks)
— define el CRUD de `networks`/`datasets` (F5a); train/predict y pesos van en F5b.

Implementado: schema NinjaAPI con throttling global (anon 10/s, auth 100/m) y
routers `users` (`/api/users`), `networks` (`/api/networks`, CRUD JWT + RF-18) y
`datasets` (`/api/datasets`, CRUD JWT con límites y reporte 1-based, §14.21),
montados en `core/api.py` (+ `/api/test`). Auth verificado e2e; routers verificados
por suite (160 tests, hasher MD5 §14.22).

F5b implementado y cerrado (spec 001, 08-11-2026, §14.26): `POST /networks/{id}/train`
(one-shot, 201 + run), `POST /networks/{id}/predict` (`{"input": [...]}` →
`{"output": [...]}`), `GET /networks/{id}/runs` (desc con snapshot),
`GET /networks/{id}/weights` (`{config, network}`, ≤ 50 MB). Errores `{ "detail": ... }`
(reporte de dataset: `{"detail": {"violations", "total"}}`), schemas Ninja/Pydantic,
validaciones 404/409/422 y fallo del motor → limpieza a `draft` sin pesos ni run.
One-shot síncrono; el streaming SSE (spec 002) es async sobre ASGI (§14.27). e2e real 001 19/19 PASS.

Spec **002** aprobada (streaming SSE: la petición emite train+test por época;
cancelación al cortar la conexión sin run; curva no persistida) — **en ejecución**:
bloques A y B verdes (LiveTrainer + vista/generador async), faltan RNF, e2e real y cierre.
Enmienda 10-11-2026: modalidad async con uvicorn + threadpool, no servicios nuevos (§14.27).

## 9. Motor Rust (`engine-core`)
Responsabilidad única: **matemática numérica de la red**.
- Módulos: `matrix` (Matrix, `Initialization` He/Xavier), `neural_network` (forward,
  backprop, update de pesos, `train` por ejemplo, to/from JSON vía `NetworkSendInformation`),
  `nn_config` (contrato JSON↔red, CSV parsing, split train/test, shuffle).
- Pérdidas: MSE, BCE, MAE (`LossFn`). Métricas: R², Accuracy.
- `f32` LOCKED. Sin I/O, HTTP, DB ni lógica web en este crate.
- Tests de integración numérica: XOR, seno (multi-semilla), diabetes.
- Errores: `EngineError` (errors.rs) con códigos `config|shape|empty_split|divergence|softmax|dataset|unexpected`
  expuestos a Python como `ValueError("engine::<código>: <mensaje>")`; el lazo numérico
  interno aún usa `Result<_, String>` en algunos métodos y se mapea en la frontera.

## 10. Puente PyO3
- Crate como **extensión de Python** (`cdylib`), módulo `engine_core._engine`.
- Exposición: `train_json`, `train_csv`, `parse_csv`, `predict_json`, `evaluate_json`, clase `LiveTrainer` (SSE: `start_info`/`next_epoch`/`result`). Errores → `PyValueError` con prefijo `engine::`.
- Motor y `LiveTrainer` son `Send + Sync` (Matrix con `Arc`, `LossFn + Send + Sync`); las llamadas largas usan `Python::detach` para soltar el GIL, lo que permite concurrencia real entre épocas.
- **Verificado**: PyO3 0.30.1 ↔ CPython 3.14.4 GIL-enabled, ABI `cp314-win_amd64`,
  **sin `abi3`**. Rust 1.98.1 ≥ MSRV 1.85. `maturin develop` (1.16.0) instala
  `synforja-engine` editable; XOR entrenado desde Python predice correctamente.

## 11. Comandos de trabajo (PowerShell)
```powershell
cargo build                                   # workdir: engine-core
cargo test                                    # workdir: engine-core
cargo test --release --test train_bench -- --ignored --nocapture   # bench µs/paso

cmd /c ".venv\Scripts\maturin.exe develop"            # instalar extensión (raíz del repo)
cmd /c ".venv\Scripts\maturin.exe develop --release"

rav run be_start      # backend: uvicorn core.asgi:application (SSE; ver rav.yaml)
rav run be_migrate / be_make_migrations
rav run fe_install / fe_start   # cuando exista frontend/
```
> Invocar `maturin.exe` directamente en PowerShell puede colgarse; usar `cmd /c` (verificado).

## 12. Roadmap por fases
| Fase | Alcance | Estado |
|---|---|---|
| F0 — Cimientos | puente PyO3→Python + scaffold Django + JWT base | **HECHA** |
| F1 — Álgebra Rust | `Matrix`, `matmul`, He/Xavier | **HECHA** |
| F2 — Forward | capa→red, `forward` | **HECHA** |
| F3 — Backprop | pérdidas, regla de la cadena, `backward` | **HECHA** |
| F4 — Entrenamiento | SGD, split train/test, shuffle, métricas (XOR/seno/diabetes) | **HECHA** (pendiente seed en contrato, §14.15) |
| F5a — CRUD | modelos `Network`/`Dataset` + routers Ninja | **HECHA** (spec 000 completa: A+B+C+D, 112 tests) |
| F5b — Endpoints numéricos | train/predict via `engine_core`, límite de épocas | **HECHA** (001 cerrada; 002 streaming async en curso, §14.27) |
| F6 — Frontend | Next.js: editor no-code, métricas, login (sin explicación teórica) | pendiente |

## 13. Definition of Done
- [ ] Compila (`cargo build` / `manage.py check`) y pasa tests sin warnings nuevos.
- [ ] Concepto nuevo explicado al humano (§2).
- [ ] Contrato de fronteras respetado (§6).
- [ ] Verificado con un caso concreto, no solo "parece funcionar".

## 14. Decisiones y preguntas abiertas
Registro de decisiones. No se cambian en silencio: se actualizan aquí y se explican.

**Resueltas:**
1. Frontend: Next.js 16 App Router + TS, con **login/registro** (F6).
2. Estructura: `backend/` + `frontend/` en la raíz, sin workspaces/monorepo.
3. maturin: módulo Python `engine_core`, layout **mixed**, `pyproject.toml` en raíz.
4. `engine-core`: sin `main.rs`; crate = cdylib de extensión (+ rlib para tests).
5. Precisión: **`f32` fijo**.
6. Pesos: **He** (ReLU) / **Xavier** (resto).
7. Persistencia: SQLite en dev (Postgres en prod), **pesos serializados en DB**.
8. Entrenamiento: **síncrono**, con límite de tamaño de red y épocas.
9. Datasets: JSON y CSV, validados con Pydantic.
10. PyO3 0.30.1 ↔ CPython 3.14.4 verificado; sin `abi3`.
11. `import engine_core` expone `train_json`, `train_csv`, `parse_csv`, `predict_json`, `evaluate_json` (verificado).
12. **Auth oficial**: register/login JWT (django-ninja-jwt), rate-limiting por IP con Redis,
    login anti user-enumeration (fake hash check). Frontend tendrá auth.
13. **Redis mantenido** como cache/rate-limit (justificación: throttling y locks de auth).
14. Frontend será Next.js, **puerto 3000** (CORS actual `:5173` sobra, corregir en F6).
15. **Semilla obligatoria** en el contrato JSON del modelo (ChaCha8): implementada en
    F5b (campo obligatorio, `seed_from_u64` para init y shuffle; sin fallback expuesto).
16. **SGD puro** (ejemplo a ejemplo), **sin batches**; batch_size fuera del modelo de dominio.
17. **Rayon NO se activa** (decisión 08-11-2026): con la referencia real de RNF-1 midiendo
    334,7 s, el dueño eligió optimizar el lazo escalar. Resultado: 124,8 s (2,68×),
    mediante matmul especializado para vector columna, backward sin trasposiciones
    materializadas y activación/bias/update in-place; la aritmética y el orden de suma
    no cambian (misma convergencia bit a bit). Bench: `engine-core/tests/train_bench.rs`.
18. **thiserror** en el motor: `EngineError` implementado en la frontera (001 A);
    el refactor interno completo de `String` sigue pendiente.
19. Router `users` montado en `core/api.py` (`/api/users`); rate-limit de auth con
    `cache.set(timeout=int(timedelta.total_seconds()))` — verificado e2e con servidor real.
    Login responde `{refresh_token, access_token}` y register `{access, refresh}` (unificar
    nombres queda para una pasada de limpieza del schema).
20. **Topes de tamaño adelantados de F5b a F5a** (RF-18, espec 000, 08-11-2026):
    capas ≤ 20, neuronas por capa ≤ 2048; los límites de dataset (5 MB / 50k filas,
    RF-12) llegan con el bloque C; `DATA_UPLOAD_MAX_MEMORY_SIZE` subido a 6,5 MB por
    delante (463: default 2,5 MB rompería uploads de 5 MB con 400 antes de nuestro
    handler). Los topes de coste de entrenamiento (epochs/lr) siguen en F5b.
21. **Bloque C (08-11-2026, enmienda II spec 000)**: `POST /api/datasets` exige
    `source_type` explícito (sustituye la inferencia "implícito" del plan); reporte
    RF-11/17 en 1-based con claves `row/col/reason` y cuerpo
    `{"detail": {"violations": [...], "total": N}}` vía `JsonResponse` (ninja 1.7.1
    hace `str()` del detail de `HttpError`: los dicts explotan); límites 413/422 con
    mensaje plano; lógica de escaneo pura en `datasets/validation.py` con outcomes
    `Ok | Limit | Invalid` y tests     unitarios; tamaño límite medido sobre el contenido (≤ 5 MB, ≤ 50k filas);
    anchura CSV = primera fila no vacía, fila en blanco = violación (CSV puro
    estricto); JSON: claves exactas `inputs`/`expects`, bool no es número, sin
    `input_cols`; `DatasetOut` incluye `content_url` apuntando a
    `GET /api/datasets/{id}/content` (RF-13); CSV almacenado tal cual, JSON
    re-serializado compacto.
22. **Hasher de tests = MD5** (`core/apitest.py` `TEST_HASHER`, `override_settings`
    en `ApiTestBase`): PBKDF2 default de Django tarda 0,7–6 s por hash en esta
    máquina y los suites tardaban minutos (falsos hangs); con MD5: suite completa
    112 tests en ~3 s. Solo afecta ejecución de tests.
23. **Redis en Docker** (08-11-2026): Redis estaba caído en dev; el dueño eligió
    arrancarlo como contenedor `synforja-redis` (redis:7-alpine, puerto 6379,
    `--restart unless-stopped`) para hacer el e2e del bloque D idéntico a producción.
    Si un día Docker no corre, el backend dará 500 en cada request por el throttling.
24. **RNF verificados en bloque D** (08-11-2026): RNF-1 CRUD red con 100 redes —
    list p95 **39,6 ms**, detail/create/patch/delete ≤ 6,2 ms (umbral 200 ms);
    RNF-2 CSV 50k filas / 4,41 MB — subida completa **534,8 ms** (umbral 2 s),
    content fetch 31,7 ms. Benchmarks en `core/perf.py`, NO corren con la suite
    general (solo `manage.py test core.perf`); suite entera = 112 tests ~3,7 s.
25. **RF-16 verificado** (bloque D): crear red → matar `runserver` → arrancar →
    GET 200; cierre de F5a con e2e de 19 comprobaciones PASS (CU-1..CU-6).
26. **F5b implementado** (08-11-2026, spec 001): train/runs/predict/weights con
    suite de **160 tests** y e2e real **19/19 PASS** (incluye reinicio → pesos y runs
    persisten, RF-20). Contrato del motor: seed obligatoria, CSV sin cabecera,
    errores tipados con prefijo `engine::`, metrics con `split`, `predict_json`/
    `evaluate_json`; editar una red `trained` limpia pesos y conserva runs.
    Benchmarks release: RNF-3 runs p95 **18,0 ms** ✓; RNF-1 referencia
    5 000×7×1 000 epochs → 334,7 s ✗ inicial, optimizado el lazo escalar (§14.17)
    a **124,8–127,1 s ✓** (mse 3,6e-13, r² 1,0, convergencia idéntica). Fase cerrada.
27. **Streaming SSE async** (10-11-2026, enmienda spec 002): vista `async def` +
    generador async sobre **ASGI/uvicorn** (nueva dependencia de servidor, no servicio);
    ORM con `sync_to_async(thread_sensitive=True)` y cada época con
    `thread_sensitive=False` para liberar el hilo entre épocas. El motor expone
    `Python::detach` (GIL liberado) y `LiveTrainer` pasó a `Send + Sync` (Matrix con
    `Arc`, `LossFn + Send + Sync`) para usar hilos del threadpool. Bajo WSGI el stream
    no funciona (Django rechaza iteradores async); `be_start` ahora es uvicorn.
    Cancelación por desconexión se aplica al terminar la época en curso (Rust no es
    interrumpible a mitad de época). Tests async del stream usan
    `ApiTransactionTestBase` (sin transacción envolvente) y consumen con `async_to_sync`.

**Abiertas:**
- `SECRET_KEY` hardcoded en settings: el humano lo migrará a `.env` al pasar a prod
  (ya carga con dotenv).
- Versionado de API (`/api/` actual, ¿`/api/v1`?): decidir antes de crear routers F5a.

## 15. Prohibiciones / anti-patrones
- No lógica numérica en Python ni en JS: eso es de Rust.
- No introducir servicios nuevos (celery, docker…) sin justificación registrada en §14 (Redis ya justificado, §14.13).
- No reescribir decisiones en silencio: los cambios van a §14 y se explican.
- No dar por terminada una fase sin cumplir §13.
