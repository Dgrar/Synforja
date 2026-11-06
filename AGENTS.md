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
| Cache / rate-limit | Redis (Django `RedisCache`, `redis://127.0.0.1:6379/1`) | redis-py 8.1.0 (§14.13) |
| Email en Pydantic | email-validator 2.3.0（req. de `EmailStr`) | 2.3.0 |
| Task runner | `rav` (ver `rav.yaml`) | 0.4.3 |
| Entorno | Windows / PowerShell | — |

Reglas: no cambiar de librería sin justificarlo en §14. Preferir lo ya instalado.

## 5. Estructura del repo (actual)
```
Synforja/
├── AGENTS.md, README.md, rav.yaml, pyproject.toml
├── .venv/                 # CPython 3.14 + Django, Ninja, JWT, Pydantic, maturin, rav
├── docs/memory/constitution.md   # principios innegociables (spec-driven)
├── backend/               # Django 6.1.2
│   ├── core/              # settings, urls, api (NinjaAPI + throttling)
│   ├── users/             # register/login JWT, schemas, rate-limiting (auth.py)
│   ├── datasets/          # app placeholder (pendiente F5a)
│   └── training/          # app placeholder (pendiente F5b)
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
router `users` montado en `/api/users` (+ `/api/test`). Endpoints verificados end-to-end
con servidor real: `POST /api/users/register` y `POST /api/users/login` (JWT + rate-limit 429).

Pendiente (borrador): `POST/GET /networks`, `POST /networks/{id}/train`,
`POST /networks/{id}/predict`, `GET /networks/{id}/runs`. Errores `{ "detail": ... }`,
schemas Ninja/Pydantic. **Sync** por ahora; async/celery solo si una fase lo exige.

## 9. Motor Rust (`engine-core`)
Responsabilidad única: **matemática numérica de la red**.
- Módulos: `matrix` (Matrix, `Initialization` He/Xavier), `neural_network` (forward,
  backprop, update de pesos, `train` por ejemplo, to/from JSON vía `NetworkSendInformation`),
  `nn_config` (contrato JSON↔red, CSV parsing, split train/test, shuffle).
- Pérdidas: MSE, BCE, MAE (`LossFn`). Métricas: R², Accuracy.
- `f32` LOCKED. Sin I/O, HTTP, DB ni lógica web en este crate.
- Tests de integración numérica: XOR, seno (multi-semilla), diabetes.
- Errores hoy devueltos como `String`; refactor a `thiserror` pendiente (§14.18).

## 10. Puente PyO3
- Crate como **extensión de Python** (`cdylib`), módulo `engine_core._engine`.
- Exposición: `train_json`, `train_csv`, `parse_csv`. Errores → `PyValueError`.
- **Verificado**: PyO3 0.30.1 ↔ CPython 3.14.4 GIL-enabled, ABI `cp314-win_amd64`,
  **sin `abi3`**. Rust 1.98.1 ≥ MSRV 1.85. `maturin develop` (1.16.0) instala
  `synforja-engine` editable; XOR entrenado desde Python predice correctamente.

## 11. Comandos de trabajo (PowerShell)
```powershell
cargo build                                   # workdir: engine-core
cargo test                                    # workdir: engine-core

cmd /c ".venv\Scripts\maturin.exe develop"            # instalar extensión (raíz del repo)
cmd /c ".venv\Scripts\maturin.exe develop --release"

rav run be_start      # backend: manage.py runserver (ver rav.yaml)
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
| F5a — CRUD | modelos `Network`/`Dataset` + persistencia de pesos, routers Ninja | **SPEC 000 APROBADA** (specs/000) |
| F5b — Endpoints numéricos | train/predict via `engine_core`, límites de red/épocas | pendiente |
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
11. `import engine_core` expone `train_json`, `train_csv`, `parse_csv` (verificado).
12. **Auth oficial**: register/login JWT (django-ninja-jwt), rate-limiting por IP con Redis,
    login anti user-enumeration (fake hash check). Frontend tendrá auth.
13. **Redis mantenido** como cache/rate-limit (justificación: throttling y locks de auth).
14. Frontend será Next.js, **puerto 3000** (CORS actual `:5173` sobra, corregir en F6).
15. **Semilla obligatoria** en el contrato JSON del modelo (ChaCha8); `rng()` sin semilla
    solo como fallback no determinista hasta F5b.
16. **SGD puro** (ejemplo a ejemplo), **sin batches**; batch_size fuera del modelo de dominio.
17. **Rayon aplazado**: se activa solo si el entrenamiento vía API es lento.
18. **thiserror** en el motor: refactor de errores `String` → enums tipados.
19. Router `users` montado en `core/api.py` (`/api/users`); rate-limit de auth con
    `cache.set(timeout=int(timedelta.total_seconds()))` — verificado e2e con servidor real.
    Login responde `{refresh_token, access_token}` y register `{access, refresh}` (unificar
    nombres queda para una pasada de limpieza del schema).

**Abiertas:**
- `SECRET_KEY` hardcoded en settings: el humano lo migrará a `.env` al pasar a prod
  (ya carga con dotenv).
- Versionado de API (`/api/` actual, ¿`/api/v1`?): decidir antes de crear routers F5a.

## 15. Prohibiciones / anti-patrones
- No lógica numérica en Python ni en JS: eso es de Rust.
- No introducir servicios nuevos (celery, docker…) sin justificación registrada en §14 (Redis ya justificado, §14.13).
- No reescribir decisiones en silencio: los cambios van a §14 y se explican.
- No dar por terminada una fase sin cumplir §13.
