# AGENTS.md — Synforja

> Fuente única de verdad del proyecto, para agentes de IA **y** para el humano.
> Debe mantenerse entre ~100 y ~300 líneas. Si algo supera ese tamaño, se va a un doc aparte y aquí solo queda el puntero.

## 1. Qué es Synforja
Web **full-stack** que ofrece una alternativa **no-code** para diseñar, entrenar y ejecutar
**redes neuronales simples** (MLP / feed-forward). El usuario arma el grafo en el navegador
(capas, neuronas, activaciones, hiperparámetros), y Synforja lo valida, lo entrena y
devuelve métricas y predicciones — sin que el usuario escriba código.

El **cálculo pesado** (producto de matrices, forward pass, backpropagation, descenso de
gradiente) vive en **Rust** y se expone a **Python** vía **PyO3**; Python/Django solo orquesta.

## 2. Contrato pedagógico (NO NEGOCIABLE)
El humano debe **entender cada concepto NO-frontend** que se implemente. No se acepta
"caja negra".

- Antes o al cerrar cada pieza no trivial, explicar **qué problema resuelve** y **por qué**.
- Cuando aparezca matemática (producto matricial, derivada de la pérdida, regla de la
  cadena, update de pesos), se **deriva el paso** y se muestra un **ejemplo numérico mínimo**.
- Definir el vocabulario la primera vez que se usa (tensor, batch, época, learning rate, bias…).
- Al terminar cada fase: resumen "qué construimos / cómo funciona / cómo se verifica".
- El humano puede interrumpir en cualquier momento con "para y explícame esto".
- **Excepción explícita:** la parte de **frontend/UX** puede implementarse sin explicación teórica.

## 3. Idioma y estilo
- Documentación, commits y explicaciones: **español**. Identificadores de código: **inglés**.
- Respuestas concisas; sin relleno ni resúmenes redundantes.
- Nada de comentarios en el código salvo que aporten algo no obvio.

## 4. Stack y decisiones (LOCKED salvo propuesta explícita)
| Capa | Tecnología | Versión objetivo |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript | por FIJAR (aún no scaffoldeado) |
| API | Django + Django Ninja | Django 6.1.2 · django-ninja 1.7.1 |
| Validación | Pydantic v2 | 2.14.1 |
| Motor numérico | Rust (crate `engine-core`) | edition 2021 |
| Precisión numérica | `f32` (fijo) | — |
| Puente Python↔Rust | PyO3 + maturin | pyo3 0.30.1 · maturin 1.15.0 |
| Errores Rust | thiserror | 2.0.1 |
| Runtime Python | CPython | 3.14.4 (`.venv/`) |
| Entorno | Windows / PowerShell | — |

Reglas: no cambiar de librería sin justificarlo en la sección 14. Preferir lo ya instalado.

## 5. Estructura del repo
Estado **actual**:
```
Synforja/
├── AGENTS.md            # este documento
├── .venv/               # Python 3.14 + Django, Ninja, Pydantic, maturin
└── engine-core/         # crate Rust (pyo3 + thiserror)
    ├── Cargo.toml
    └── src/{lib.rs,main.rs}
```
Estructura **objetivo** (a crear):
```
backend/        # proyecto Django + app api/ con routers Ninja
frontend/       # Next.js
engine-core/    # Rust: núcleo numérico (cdylib para Python)
pyproject.toml  # build maturin (pendiente, ver §14)
```

## 6. Arquitectura y fronteras
```
Next.js  ──HTTP/JSON──▶  Django Ninja (API, validación Pydantic)
                                │
                                ▼
                         Python orquestador  ──PyO3──▶  engine-core (Rust)
                         (persistencia, métricas)         (matmul, forward, backprop)
```
Regla de dependencia: **el frontend nunca calcula**; **Django nunca hace matemática de red**;
**Rust nunca conoce HTTP ni modelos de Django**. Cada frontera habla con un contrato claro.

## 7. Modelo de dominio (borrador)
- `Network` — id, nombre, tipo (`MLP`), estado (`draft|training|trained`).
- `Layer` — índice, nº de neuronas, función de activación (`relu|sigmoid|tanh|softmax|linear`).
- `Connection` — entrada→M capa; pesos inicializados (ver §14, semilla).
- `TrainingConfig` — epochs, learning_rate, batch_size, loss, optimizador, **semilla**.
- `Run` — histórico de métricas por época (loss, accuracy).
- `Dataset` — filas de features + etiquetas, en **JSON o CSV**, validado con Pydantic.

Pesos inicializados con **He** (capas ReLU) / **Xavier** (resto), usando la semilla de
`TrainingConfig` para reproducibilidad. Un `Network` + `TrainingConfig` debe ser
**serializable a JSON** y reconstruible de forma determinista: es el contrato que cruza
todas las fronteras.

## 8. API (borrador, no definitiva)
- `POST /api/v1/networks` — crear grafo (validado con Pydantic).
- `GET  /api/v1/networks/{id}` — detalle.
- `POST /api/v1/networks/{id}/train` — entrenar; devuelve `Run` con métricas.
- `POST /api/v1/networks/{id}/predict` — inferencia sobre un input.
- `GET  /api/v1/networks/{id}/runs` — histórico.

Convención: prefijo `/api/v1`, errores con `{ "detail": ... }`, entrada/salida como schemas
Ninja/Pydantic. **Sync** por ahora; no introducir async/celery hasta que una fase lo exija.

## 9. Motor Rust (`engine-core`)
Responsabilidad única: **matemática numérica de la red**.
- Tipos: `Matrix`, `Layer`, `Network` (Rust), con `f32` como precisión (LOCKED, §14).
- Operaciones: `matmul`, suma/broadcast de bias, activaciones y sus derivadas,
  `forward`, `backward` (backprop), `gradient_descent`/update de pesos.
- Errores con `thiserror` (dimensiones incompatibles, red inválida, etc.).
- Test unitario numérico por operación (gradiente finito vs. analítico para backprop).
- **Nada de** I/O, HTTP, DB, ni lógica de negocio web en este crate.

## 10. Puente PyO3
- El crate se compila como **extensión de Python** (`cdylib`) y se consume como módulo.
- Python le pasa **arrays planos / JSON** y recibe métricas; la traducción vive en un solo módulo.
- Errores Rust → excepciones Python con mensaje claro.
- **Verificado**: PyO3 0.30.1 compila contra CPython 3.14.4 GIL-enabled; ABI
  version-specific `cp314-win_amd64`, **sin `abi3`**. `cargo build` OK.
- `maturin develop` exige `[lib] crate-type = ["cdylib"]` y `pyproject.toml` (pendiente, F0).
- `main.rs` se elimina en F0 (§14.4).

## 11. Comandos de trabajo (PowerShell)
```powershell
# Rust: compilar y testear
cargo build                    # workdir: engine-core
cargo test                     # workdir: engine-core

# Compilar/instalar la extensión en el venv
.venv\Scripts\activate.ps1
maturin develop                # requiere pyproject.toml (§14)

# Backend (cuando exista backend/)
python manage.py migrate
python manage.py runserver
```

## 12. Roadmap por fases (cada una con checkpoint de aprendizaje)
1. **F0 — Cimientos**: scaffold Django + Ninja, `pyproject.toml`/maturin, "hola mundo" Rust→Python.
2. **F1 — Álgebra en Rust**: `Matrix`, `matmul`, activaciones y sus derivadas + tests.
3. **F2 — Forward**: capa→red, `forward` completo, ejemplo numérico verificado a mano.
4. **F3 — Backprop**: pérdida, regla de la cadena, `backward`, chequeo por gradiente finito.
5. **F4 — Entrenamiento**: épocas/epochs, batches, learning rate, métricas (`Run`).
6. **F5 — API**: endpoints §8 con validación Pydantic, persistencia.
7. **F6 — Frontend**: editor no-code del grafo, visualización de métricas (sin auth, sin explicación teórica).

## 13. Definition of Done
- [ ] Compila (`cargo build`) y pasa tests (`cargo test`) sin warnings nuevos.
- [ ] El concepto nuevo fue explicado al humano (§2).
- [ ] Contrato de fronteras respetado (§6).
- [ ] Verificado con un caso concreto, no solo "parece funcionar".

## 14. Decisiones y preguntas abiertas
Registro de decisiones. Según §15 no se cambian en silencio: se actualizan aquí y se explican.

**Resueltas:**
1. Frontend: **sin auth**, se scaffoldea en **F6** (Next.js App Router desde cero).
2. Estructura: **`backend/` + `frontend/` en la raíz**, sin workspaces ni monorepo.
3. maturin: módulo Python **`engine_core`**, layout **mixed**, `pyproject.toml` en la raíz.
4. `engine-core`: se **elimina `main.rs`**; el crate queda solo como cdylib de extensión.
5. Precisión numérica: **`f32` fijo** (no configurable).
6. Pesos: **He** (ReLU) / **Xavier** (resto) con **semilla** en `TrainingConfig`.
7. Persistencia: **SQLite** en dev (Postgres en prod); **pesos serializados en la DB**.
8. Entrenamiento: **síncrono** en el request, con **límite** de tamaño de red y épocas.
9. Datasets: **JSON y CSV**, ambos validados con Pydantic.
10. PyO3 0.30.1 ↔ Python 3.14.4: **compatible y verificado**. Build real contra
    CPython 3.14.4 GIL-enabled → `target_abi=CPython-gil_enabled-3.14`,
    `SOABI=cp314-win_amd64`. **No se usa `abi3`** (solo hace falta si se distribuyen
    wheels a varias versiones de Python). Rust 1.98.1 ≥ MSRV 1.85.

**Abiertas:**
- Ninguna bloqueante. Las nuevas dudas se añaden aquí antes de decidir.

## 15. Prohibiciones / anti-patrones
- No lógica numérica en Python ni en JS: eso es de Rust.
- No introducir servicios (celery, redis, docker) sin que una fase lo justifique.
- No reescribir esta sección de decisiones en silencio: los cambios van a §14 y se explican.
- No dar por terminada una fase sin cumplir §13.
