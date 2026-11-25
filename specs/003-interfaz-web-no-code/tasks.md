# Tasks 003 — Interfaz web no-code (F6)

> Ejecución de `plan.md` contra `spec.md`. Cada tarea cierra con sus tests en verde.
> Marca `[x]` al completar; no se avanza de bloque con tests rojos.

## Bloque A — Backend de sesión cookie-only

- [x] **T1. Cookies y settings** — constantes y helpers de cookies (`synforja_access`, `synforja_refresh`, `synforja_csrf`), vidas desde `NINJA_JWT`, `Secure` salvo DEBUG, `SameSite` configurable y borrado con `Path` exacto. Añadir setting de `SameSite` y CORS con credenciales.
      *Hecho si:* `manage.py check` limpio y tests de atributos de cookie.
- [x] **T2. Auth por cookie + CSRF** — `CookieJWTAuth` que acepta Bearer para tests y cookie para navegador; exige `X-CSRFToken` en escrituras autenticadas por cookie; comparación constante. Sustituir `JWTAuth()` en `networks`/`datasets`.
      *RN:* RN-13. *Hecho si:* cookie válida autentica, sin token 401, escritura sin CSRF 403, Bearer sigue funcionando.
- [x] **T3. Endpoints de sesión** — `GET /api/users/csrf`, `GET /api/users/me`, `POST /api/users/refresh` (cookie de refresh, sin body) y `POST /api/users/logout` (limpia cookies, 204). Login/register setean cookies y dejan de devolver tokens. `Cache-Control: no-store`.
      *RF:* RF-1, RF-3, RF-6, RF-7, RF-8 (backend). *Hecho si:* tests de cada contrato y ausencia de tokens en JSON.
- [x] **T4. Tests backend** — actualizar register/login y añadir cookie flow, `/csrf`, `/me`, refresh, logout, CSRF 403, expiración/refresh inválido y CORS con credenciales. Helper `csrf_headers()` en `core/apitest.py`.
      *Hecho si:* `manage.py test` completo verde (168 + nuevos). **Hecho:** 186 tests verdes (`manage.py test`, 4,8 s) + `manage.py check` limpio.
- [x] **T5. Verificación con servidor real** — login/register con `curl` guardando cookies, `/me`, escritura con y sin CSRF, refresh al acortar access, logout y recarga. `manage.py check` + suite.
      *Hecho si:* evidencia de cookies HttpOnly y flujo completo; desviaciones anotadas.
      *Evidencia (14-11-2026):* uvicorn `127.0.0.1:8014` + Redis Docker; cliente real con `requests.Session` verificó registro/login sin tokens, `/me`, lectura privada, escritura 201 con CSRF y 403 sin/erróneo, refresh con access caducado simulado, logout 403/204, borrado de cookies, CORS con credenciales y preflight de `X-CSRFToken`. Todas las comprobaciones PASS.

## Bloque B — Base del frontend

- [x] **T6. Scaffold y comandos** — Node 22, Next 16 App Router, TS, Tailwind, Vitest; `frontend/.env.local.example` con API `http://localhost:8000/api`; `rav` con `fe_lint`/`fe_build`/`fe_test`.
      *Hecho si:* `npm run build` inicial y tests de humo.
      *Hecho (18-11-2026):* `frontend/` con Next `16.4.6`, React `19.3.1`, TS `5.9.3`, Tailwind `4.3.5` y Vitest `5.1.0`; `.nvmrc` (`22.23.5`), `.env.local.example`, scripts `fe_lint`/`fe_build`/`fe_test`; build estático de 8 rutas PASS.
- [x] **T7. Sesión y cliente API** — bootstrap `/csrf`, `/me`, refresh single-flight, reintento 401/403 CSRF, `credentials:"include"`, cero tokens en storage, `SessionProvider` y `AuthGuard`.
      *RF:* RF-1..RF-8. *Hecho si:* Vitest de bootstrap, refresh y CSRF; login/registro/logout funcionan contra backend.
      *Hecho (18-11-2026):* `SessionProvider`, `AuthGuard`, `GuestGuard`, `apiFetch`, CSRF en memoria y refresh single-flight; **21 tests Vitest PASS**. Chrome headless real contra uvicorn `:8000` + Next `:3000`: **14/14 PASS** (registro, login, recarga, logout, guard de ruta con `next`, `document.cookie`/storage sin tokens).
- [x] **T8. Shell, panel y navegación** — layout responsive, menú, panel con contadores, estados vacíos y guard de navegación.
      *Hecho si:* rutas privadas protegidas y navegación básica sin errores.
      *Hecho (18-11-2026):* shell de escritorio lateral y drawer móvil, panel con contadores de redes/datasets, listas read-only y estados vacíos, `NavigationGuard` con centinela de historial; rutas privadas verificadas en navegador. Rutas `/`, `/networks`, `/datasets`, `/login`, `/register` compilan y renderizan.

## Bloque C — CRUD

- [x] **T9. Redes** — lista, alta, edición, confirmación de pérdida de pesos, borrado y `TopologyPreview` sin cálculo.
      *RF:* RF-9..RF-15. *Hecho si:* CRUD completo y RNF-2 medido.
      *Hecho (18-11-2026):* alta/edición/detalle/borrado con confirmación; la edición conserva la semilla y una red `trained` exige confirmación para volver a `draft`. E2E real en build de producción: p95 de cambio local con 20 capas **104,7 ms** (< 200 ms).
- [x] **T10. Datasets** — alta CSV/JSON desde archivo o texto, reporte de violaciones, lista, detalle, preview 200/100, descarga y borrado.
      *RF:* RF-16..RF-22. *Hecho si:* flujo completo con límites y errores reales.
      *Hecho (18-11-2026):* alta CSV/JSON por archivo o texto, violaciones 1-based, preview, descarga íntegra y borrado; E2E Chrome **31/31** incluye archivo local, reporte real, CSV completo y RNF-2.

## Bloque D — Entrenamiento

- [x] **T11. Entrenamiento en vivo** — selector red/dataset/modalidad, parser SSE, panel de progreso, curva SVG, cancelación y refresco de estado.
      *RF:* RF-23..RF-28. *RNF:* RNF-1. *Hecho si:* stream real consume eventos sin bloqueos.
      *Hecho (25-11-2026):* `TrainingPanel` lanza con la configuración guardada (solo dataset y modalidad se eligen), consume el stream con `fetch` + `ReadableStream` (`lib/api/sse.ts`), agrupa el render cada 100 ms y muestra época/total, pérdidas, progreso y curva SVG (`LossChart`, downsample visual > 2 000 épocas con la serie completa en estado). Parser SSE cubierto por Vitest (frames partidos, varios por chunk, UTF-8 byte a byte, frame incompleto). *Pendiente:* E2E del stream real y RNF-1 en navegador (T15).
- [x] **T12. Interrupciones y guardas** — errores de stream, relanzamiento manual, 409, one-shot y confirmación de salida/recarga.
      *RF:* RF-29..RF-32. *Hecho si:* E2E de corte, cancelación y navegación durante vivo.
      *Hecho (25-11-2026):* cancelación por `AbortController` que distingue acción del usuario (RF-27) de fallo de red (RF-29, con relanzamiento desde la época 1); 409/422 del lanzamiento → motivo + refresco del estado sin abrir stream; one-shot con espera sin épocas ni curva (RF-31); `NavigationGuard` con `beforeunload`, intercepción de clics internos y centinela de historial (RF-32). *Pendiente:* E2E de corte/cancelación/navegación en navegador (T15).

## Bloque E — Resultados y cierre

- [x] **T13. Corridas y comparación** — lista desc con snapshot y comparación de 2 a 4.
      *RF:* RF-33, RF-34. *Hecho si:* comparación completa y quinta selección rechazada.
      *Hecho (25-11-2026):* `/networks/[id]/runs` lista las corridas tal como las devuelve la API (reciente → antigua) con métricas y snapshot del dataset; selección efímera en memoria con tope de 4 (RN-12): la quinta no se añade y se avisa; comparación lado a lado a partir de dos. Lógica pura en `lib/runs/compare.ts` con **4 tests Vitest** (añadir/quitar, no duplicar, quinta rechazada, hueco liberado). *Pendiente:* E2E visual (T15).
- [x] **T14. Predicción y pesos** — vector de entrada, salida de la API, descarga blob de pesos y errores.
      *RF:* RF-35..RF-38. *Hecho si:* 409/422/413 visibles sin resultados locales.
      *Hecho (25-11-2026):* `/networks/[id]/predict` parsea el vector (comas/espacios/`;`, rechaza vacío y no finitos) y muestra la salida de la API en orden con aviso si la red no está entrenada; 409/422 de la API se muestran sin calcular salida local. Pesos desde el detalle: `GET /weights` como blob con `red-<id>.json`; 409/413/red → motivo y **ningún archivo**. Parser cubierto por **6 tests Vitest**. *Pendiente:* E2E visual (T15).
- [x] **T15. Pulido y cierre** — responsive 360–1920, teclado/foco/etiquetas, revisión de seguridad (HttpOnly/CSRF/storage), Vitest, lint/build, E2E, RNF y `AGENTS.md`.
      *RF:* RNF-3..RNF-6, RNF-5. *Hecho si:* criterios de cierre del plan marcados y evidencia por RF.
      *Hecho (25-11-2026)* con E2E sobre **build de producción** (`next start`, 14 rutas) + uvicorn `:8000` + Redis y Chrome headless controlado por CDP (script temporal, retirado al cerrar): **49/49 PASS**.
      *CU-1..CU-9 y RF:* registro con cookies HttpOnly y panel (RF-1); duplicado con motivo y sin sesión (RF-2); login y retorno a la vista pedida por `next` (RF-3/RF-7); mensaje idéntico para usuario inexistente y contraseña errónea (RF-4); sin cookies no hay vistas privadas y otro usuario no ve ni abre recursos ajenos (RF-5/RF-13/RF-19/RN-3); cookie de acceso borrada → refresh transparente (RF-6); logout vacía cookies (RF-8); red creada con los 8 campos y previsualización 7→8→7 (RF-9/RF-10); violación por campo con valores conservados (RF-11); edición de red entrenada con confirmación → borrador (RF-12); borrado de red con confirmación (RF-14); 409 al borrar una red entrenando (RF-15); dataset CSV desde archivo con `input_cols` solo en tabular (RF-16/RF-17); reporte 1-based y 413 > 5 MB (RF-18); preview 200 filas + descarga de 250 (RF-20); fallo de contenido con reintento sin datos parciales (RF-21); borrado de dataset con confirmación/cancelar (RF-22); vivo con época/total/curva/run y estado entrenada (RF-23/RF-25/RF-28); dataset incompatible → motivo sin curva ni run (RF-24); cancelación sin run y en borrador (RF-26/RF-27); corte de corriente con relanzamiento desde la época 1 (RF-29); segundo lanzamiento simultáneo → 409 (RF-30); one-shot con espera sin épocas ni curva (RF-31); confirmación al navegar fuera y `beforeunload` registrado durante el vivo (RF-32); corridas desc con 6 runs y comparación de 4 rechazando la quinta (RF-33/RF-34); predicción UI `0.975215` == API `0.9752148…` (RF-35); 422 por forma, rechazo local de no finitos y 409 en red borrador, siempre sin salida (RF-36); pesos `red-<id>.json` de 583 B idéntico al volcado (RF-37); 409 sin archivo (RF-38).
      *RNF medidos:* **RNF-1** evento→pintado sobre stream de 10 000 épocas: n=162, p95 **7,8 ms**, máx 17,2 ms (< 1 s); **RNF-2** p95 **36 ms** en 10 cambios con 20 capas (< 200 ms); **RNF-3** cookies `HttpOnly` en las tres, `document.cookie` sin tokens, `localStorage`/`sessionStorage` vacíos y sin tokens en URL/DOM; **RNF-4** 16 combinaciones (4 páginas × 360/768/1280/1920) sin scroll horizontal, tabla de corridas con scroll interno a 360; **RNF-5** 42 eventos de consola, **0 excepciones** y 0 errores inesperados; **RNF-6** 0 controles sin nombre accesible y foco visible en el recorrido con Tab.
      *Corregido en este cierre:* `noValidate` en `NetworkForm` y `DatasetForm` — la validación nativa bloqueaba el submit y las violaciones por campo (RF-11) nunca llegaban a mostrarse; `min-w-0` en las columnas de `NetworkDetail` — el SVG de topología desbordaba la página a 360 px (RNF-4).
      *Límites del entorno:* Chrome headless no dibuja el diálogo de `beforeunload` (se verificó el listener activo y la confirmación en un enlace interno); la emulación *offline* de CDP no corta un stream ya abierto, así que el corte de RF-29 se simuló a nivel de red truncando la respuesta SSE; RNF-1 se midió con 10 000 épocas XOR (más eventos que la referencia 5 000×7×1 000 de spec 001, cuyo bench de motor ya existe). Observación abierta: el throttle global (100 req/min por usuario) puede agotarse en barridos largos y una `/me` con 429 hace que la interfaz trate la sesión como anónima (`AGENTS.md` §14.31).

## Matriz RF → tarea

| RF | Tarea |
|----|-------|
| 1, 2 | T3, T7 |
| 3, 4 | T3, T7 |
| 5, 6, 7, 8 | T2, T3, T7 |
| 9, 10, 11 | T9 |
| 12, 13, 14, 15 | T9 |
| 16, 17, 18, 19, 20, 21, 22 | T10 |
| 23, 24, 25, 26, 27, 28 | T11 |
| 29, 30, 31, 32 | T12 |
| 33, 34 | T13 |
| 35, 36, 37, 38 | T14 |
| RNF-1/2 | T11/T9 |
| RNF-3 | T1, T7, T15 |
| RNF-4/6 | T15 |
| RNF-5 | T15 |
