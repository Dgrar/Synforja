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

- [ ] **T11. Entrenamiento en vivo** — selector red/dataset/modalidad, parser SSE, panel de progreso, curva SVG, cancelación y refresco de estado.
      *RF:* RF-23..RF-28. *RNF:* RNF-1. *Hecho si:* stream real consume eventos sin bloqueos.
- [ ] **T12. Interrupciones y guardas** — errores de stream, relanzamiento manual, 409, one-shot y confirmación de salida/recarga.
      *RF:* RF-29..RF-32. *Hecho si:* E2E de corte, cancelación y navegación durante vivo.

## Bloque E — Resultados y cierre

- [ ] **T13. Corridas y comparación** — lista desc con snapshot y comparación de 2 a 4.
      *RF:* RF-33, RF-34. *Hecho si:* comparación completa y quinta selección rechazada.
- [ ] **T14. Predicción y pesos** — vector de entrada, salida de la API, descarga blob de pesos y errores.
      *RF:* RF-35..RF-38. *Hecho si:* 409/422/413 visibles sin resultados locales.
- [ ] **T15. Pulido y cierre** — responsive 360–1920, teclado/foco/etiquetas, revisión de seguridad (HttpOnly/CSRF/storage), Vitest, lint/build, E2E, RNF y `AGENTS.md`.
      *RF:* RNF-3..RNF-6, RNF-5. *Hecho si:* criterios de cierre del plan marcados y evidencia por RF.

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
