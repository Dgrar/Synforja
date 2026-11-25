# Plan 003 — Interfaz web no-code (F6)

> Implementación de `specs/003-interfaz-web-no-code/spec.md` (aprobada 14-11-2026; enmendada el mismo
> día para sesión cookie-only). Este documento es el CÓMO. No reabre los contratos de 000/001/002; solo
> añade la migración de sesión a cookies HttpOnly aprobada como excepción y consume el resto tal cual.

## 1. Enfoque

- **App Next.js independiente en `frontend/`** (App Router), cliente puro contra `/api`: sin SSR de datos
  privados ni BFF. La sesión vive en cookies HttpOnly; el frontend nunca lee ni guarda credenciales de
  sesión y la API sigue siendo la única autoridad.
- **Cero cálculo de red en la interfaz:** solo se muestran respuestas de la API. El escalado del gráfico,
  contar elementos o parsear texto para previsualizar son presentación, no matemática del modelo (RN-1).
- **Ampliación de backend aprobada:** sesión cookie-only: auth por cookie, `/csrf`, `/me`, `/refresh`,
  `/logout`, CSRF y CORS con credenciales. Login/register dejan de devolver tokens. Todo lo demás (CRUD,
  train one-shot y en vivo, runs, predict, weights, content) se consume sin cambios.
- **Sin servicios nuevos:** el stream se consume con `fetch` sobre la respuesta ASGI/uvicorn ya existente;
  Redis/Docker siguen siendo los de desarrollo. CORS se corrige para el puerto 3000 con credenciales.
- **Entrega por capas:** primero backend de sesión y cliente API, luego CRUD, después entrenamiento en vivo
  (lo más delicado), y al final comparación/predicción/pesos y pulido responsive/accesible.

## 2. Stack fijado para F6

| Pieza | Versión | Decisión |
|---|---|---|
| Runtime | **Node.js 22 LTS** | Locked en §4. La máquina tiene v24.18.0 y `nvm` sin versiones instaladas: precondición `nvm install 22` + `nvm use 22`. Next 16 exige ≥20.9, pero no se cambia la decisión sin aprobación. |
| Framework | **Next.js 16.4.6** (App Router) | Última 16.x; versión exacta en `package.json`. |
| UI runtime | **React / React DOM 19.3.1** | Par compatible con Next 16.4.6. |
| Lenguaje | **TypeScript 5.9.3** | Se fija 5.9 (aunque exista TS 7) para no arriesgar el ecosistema del scaffold. |
| Estilos | **Tailwind CSS 4.3.5** (scaffold) | Utilidades + variables CSS; **sin kit de componentes** (shadcn/Radix) para no ampliar dependencias. |
| Gráficas | **SVG propio** | Una sola curva de dos series; evita una librería de charts. |
| Datos/estado | `fetch` + hooks + contexto | Sin TanStack Query/Redux: listas pequeñas y refresco explícito. |
| Pruebas | **Vitest 5.1.0** | Solo lógica pura (parser de eventos, sesión, mapeo de payloads); sin DOM ni navegador. |
| Gestor | npm 11.x | `rav` ya tiene `fe_install`/`fe_start`. |

- Variables: `NEXT_PUBLIC_API_URL=http://localhost:8000/api` en `frontend/.env.local` (plantilla
  `.env.local.example`); nunca se guardan secretos ahí. Frontend canónico: `http://localhost:3000`.
  No mezclar `localhost` y `127.0.0.1`: las cookies son por host y dejarían de compartirse.
- Justificación de dependencias: Tailwind viene con el scaffold; Vitest es la única dependencia de test.
  Cualquier otra librería requiere registrar la decisión en `AGENTS.md` §14 antes de instalarla.

## 3. Backend: sesión cookie-only (ampliación aprobada)

### 3.1 Cookies

| Cookie | Contenido | Atributos |
|---|---|---|
| `synforja_access` | JWT de acceso | `HttpOnly`; `Secure` salvo DEBUG; `SameSite` configurable (Lax por defecto); `Path=/api`; `Max-Age` = vida del access |
| `synforja_refresh` | JWT de renovación | `HttpOnly`; `Secure` salvo DEBUG; `SameSite` configurable; `Path=/api/users/refresh`; `Max-Age` = vida del refresh |
| `synforja_csrf` | token aleatorio (`secrets.token_urlsafe(32)`) | `HttpOnly`; `Secure` salvo DEBUG; `SameSite` configurable; `Path=/`; `Max-Age` = vida del refresh |

- Host-only (sin `Domain`) y sin secretos en URL. `Secure` se activa con `not settings.DEBUG`; en dev
  HTTP no se marca. El `SameSite` sale de una setting (`Lax` en dev/mismo sitio; `None` + `Secure` si
  producción cruza sitios). Logout borra cada cookie con su `Path` exacto.
- **Emisión**: register/login crean refresh con `RefreshToken.for_user`, access con
  `refresh.access_token` y CSRF si falta; refresh solo renueva access; logout limpia las tres. Sin
  rotación ni blacklist: la cookie de renovación sigue válida hasta expirar; solo se borra del navegador.
- **CSRF**: doble envío. La cabecera `X-CSRFToken` debe coincidir con `synforja_csrf` (comparación
  `secrets.compare_digest`). El token se entrega en el cuerpo de `GET /api/users/csrf` y el frontend lo
  mantiene en memoria; la cookie es HttpOnly para no depender de `document.cookie` ni del dominio del
  frontend en producción. En recarga se vuelve a pedir. No se usa el CSRF de Django.

### 3.2 Endpoints y auth

- `POST /api/users/register` y `POST /api/users/login` → 200 con usuario público
  `{id, username, email}`; sin campos de token. Setean cookies. Siguen con rate-limit e
  anti-enumeración actuales.
- `GET /api/users/csrf` → 200 `{csrf_token}`; público; asegura la cookie y devuelve el valor existente o
  uno nuevo. Es el bootstrap obligatorio antes de cualquier escritura, incluido login/register.
- `GET /api/users/me` → 200 usuario público; 401 sin sesión. Hidrata la sesión al cargar la app.
- `POST /api/users/refresh` → sin body; lee `synforja_refresh`, valida con `RefreshToken(...)`, setea
  nueva cookie de acceso y responde 200 `{detail: "ok"}`; 401 y limpia cookies si falta/es inválida.
- `POST /api/users/logout` → sin auth de access (debe funcionar con access caducado), exige CSRF, limpia
  las tres cookies y responde 204; idempotente. No revoca el refresh en servidor (fuera de alcance).
- **Auth**: `CookieJWTAuth` en `backend/users/auth.py` acepta primero `Authorization: Bearer` (tests y
  clientes internos) y, si no, `synforja_access`. Sustituye `JWTAuth()` en `networks` y `datasets`; `/me`
  lo usa. Sin token → 401. Si autenticó por cookie y el método es POST/PATCH/DELETE, exige CSRF válido →
  403. Bearer queda exento para no romper la suite actual ni clientes de API.
- **Schemas** (`backend/users/schemas.py`): `UserPublicOutSchema {id, username, email}`,
  `CsrfOutSchema {csrf_token}` y `DetailOutSchema`; se retiran `UserRegisterOutSchema` y
  `UserLoginOutSchema` con tokens.
- **Implementación de cookies**: helper en `users/auth.py` que recibe `HttpResponse` y aplica
  `set_cookie`/`delete_cookie`; en Ninja los handlers reciben `response: HttpResponse` (no un
  `JsonResponse` manual). Errores de token → `HttpError(401)`; CSRF inválido → `HttpError(403)`.
  Todas las respuestas de sesión (`/csrf`, `/me`, `/refresh`, login, register, logout) llevan
  `Cache-Control: no-store`.

### 3.3 CORS y settings

- `CORS_ALLOW_CREDENTIALS = True`; `CORS_ALLOW_ALL_ORIGINS = False` incluso en debug.
  `CORS_ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]`; producción añade su
  origen exacto. `CORS_ALLOW_HEADERS` incluye `x-csrftoken` (nombre de cabecera `X-CSRFToken`).
- El host canónico evita que la cookie se pierda: frontend `localhost:3000` + API `localhost:8000`. Si
  se usa `127.0.0.1`, hay que usar el mismo host en ambos. Documentar en `.env.local.example`.
- No se habilita `CSRF_TRUSTED_ORIGINS` de Django: el CSRF es propio de la API. Actualizar §14.14.

### 3.4 Tests

- `backend/users/tests.py`: register/login devuelven usuario y cookies `HttpOnly` sin tokens en el JSON;
  `/me` con cookie y con Bearer; refresh válido/inválido sin body; logout limpia cookies; CSRF ausente o
  distinto → 403 sin cambio de estado; Bearer exento; flujo cookie completo (login → crear red).
- `core/apitest.py`: helper `csrf_headers()` que llama `/csrf` y devuelve `X-CSRFToken`; `auth_headers()`
  sigue usando Bearer. Los tests de login/register pasan a usar el helper; los demás no cambian.
- Añadir CORS de credenciales: origen permitido devuelve `Access-Control-Allow-Credentials: true` y el
  origen exacto; preflight acepta `X-CSRFToken`. La suite completa debe seguir verde (168 + nuevos).

## 4. Arquitectura de la interfaz

### 4.1 Rutas

| Ruta | Acceso | Contenido |
|---|---|---|
| `/login`, `/register` | Público | Formularios; registro con contraseña ≥8 y confirmación (RN-11). |
| `/` | Privado | Panel: contadores de redes/datasets y accesos directos. |
| `/networks` | Privado | Lista propia con nombre, estado y topología; acciones. |
| `/networks/new` | Privado | Alta con editor de capas + previsualización. |
| `/networks/[id]` | Privado | Detalle, estado, acciones (editar/entrenar/runs/predecir/pesos/borrar). |
| `/networks/[id]/edit` | Privado | Edición; confirmación si la red está entrenada. |
| `/networks/[id]/train` | Privado | Selección de dataset/modalidad, curva en vivo, cancelación y resultado. |
| `/networks/[id]/runs` | Privado | Corridas y comparación de 2 a 4 lado a lado. |
| `/networks/[id]/predict` | Privado | Vector de entrada y salida devuelta por la API. |
| `/datasets` | Privado | Lista propia con tipo/tamaño/filas. |
| `/datasets/new` | Privado | Alta CSV/JSON desde archivo o texto pegado + reporte. |
| `/datasets/[id]` | Privado | Detalle, vista previa limitada (200 filas/100 ejemplos), descarga y borrado. |

- Grupos `(auth)` y `(app)`: el segundo envuelve un layout con navegación y **guarda de sesión cliente**.
  Sin middleware: la sesión vive en cookies HttpOnly y el guard solo mejora UX; la API decide.
- Navegación: barra lateral en escritorio, menú superior/colapsable en móvil; enlaces internos pasan por
  el guard de navegación cuando hay un stream activo.

### 4.2 Estructura de archivos

```
frontend/
├── package.json · next.config.ts · tsconfig.json · eslint.config.mjs · postcss.config.mjs
├── .env.local.example
└── src/
    ├── app/
    │   ├── layout.tsx · globals.css
    │   ├── (auth)/login/page.tsx · (auth)/register/page.tsx
    │   └── (app)/layout.tsx · page.tsx
    │       ├── networks/{page,new/page,[id]/page,[id]/edit/page,[id]/train/page,
    │       │              [id]/runs/page,[id]/predict/page}.tsx
    │       └── datasets/{page,new/page,[id]/page}.tsx
    ├── components/
    │   ├── ui/ (Button, Field, Alert, ConfirmDialog, EmptyState, Spinner, Table)
    │   ├── session/ (SessionProvider, AuthGuard, NavigationGuard)
    │   ├── networks/ (NetworkForm, TopologyPreview)
    │   ├── datasets/ (DatasetForm, ViolationTable, DatasetPreview)
    │   ├── training/ (TrainingPanel, LossChart, TrainingResult)
    │   └── runs/ (RunsTable, CompareRuns) · predict/ (PredictForm)
    ├── lib/
    │   ├── api/ (client, auth, networks, datasets, training, sse, errors)
    │   ├── session/ (session, refresh, csrf)
    │   ├── types/api.ts · format.ts · download.ts
    │   └── config.ts
    └── tests/ (sse.test.ts, session.test.ts, csrf.test.ts, errors.test.ts, payloads.test.ts)
```

## 5. Sesión y cliente API

- **Almacenamiento**: ninguno de credenciales. Cero `localStorage`/`sessionStorage` para tokens; las
  cookies HttpOnly viajan solas. El único valor en memoria es el token CSRF (no es una credencial de
  sesión) y se pierde al recargar, momento en que se reobtiene de `/csrf`.
- **Bootstrap** en `SessionProvider` (cliente): `GET /csrf` → guardar token en memoria; `GET /me` con
  `credentials:"include"`. Si `/me` da 401, intentar `POST /refresh` con CSRF y reintentar `/me` una vez.
  Estado `loading | authenticated | anonymous`; sin mismatch de SSR porque no hay datos privados en servidor.
  Los formularios de acceso/registro esperan al bootstrap CSRF; si falla, muestran error y no envían.
  Tras un login/register 200, se confirma con `/me`; si devuelve 401, se avisa de que el navegador no
  aceptó las cookies y no se navega como autenticado.
- **`apiFetch`** central: base `NEXT_PUBLIC_API_URL`, `credentials:"include"`, JSON, `X-CSRFToken` en
  POST/PATCH/DELETE, nunca `Authorization` desde el navegador. En 401 de una operación privada: **un solo
  refresh en vuelo** (promesa compartida), reintento único. Si refresh responde 401 (sesión ausente) se
  limpia estado y se redirige a `/login?next=<ruta>`; si responde 5xx o falla la red, se muestra error y
  se conserva el estado (no se cierra sesión por un fallo transitorio). `/csrf`, `/me`, `/refresh`, login
  y register no se reintentan en bucle.
- **CSRF**: si falta el token o una escritura devuelve 403 por CSRF, reobtener `/csrf` y reintentar una
  vez; si persiste, mostrar el motivo sin repetir la escritura. Las lecturas no llevan cabecera CSRF.
- **Errores**: `ApiError {status, detail, violations?, total?}`. Se aceptan los tres formatos de casa:
  `detail` string, lista de validación Ninja (mapear `loc` a campos) y `{violations,total}` de datasets.
  404 se muestra uniforme ("no encontrado") sin distinguir ajeno/inexistente; 409/413/422/429 muestran el
  motivo de la API y conservan el formulario.
- **Logout**: `POST /logout` con CSRF; solo tras 2xx se limpia el estado y se navega al acceso (si falla,
  se conserva la sesión y se ofrece reintentar). RF-7 conserva la ruta solicitada en `next` (solo ruta,
  nunca credenciales).
- **Expiración**: el access caducado no se detecta por reloj local; se reacciona al 401. El refresh
  caducado/inválido se trata como sesión ausente. No hay sincronización entre pestañas (fuera de alcance).

## 6. Entrenamiento en vivo (streaming)

- **Transporte**: `fetch(POST /networks/{id}/train, {Accept: text/event-stream, credentials:"include",
  X-CSRFToken, signal})`; `EventSource` no sirve (POST + headers). Si la respuesta no es 2xx, se parsea el
  error JSON y no se abre estado de stream; 401 → refresh y reintento único antes de abrir; 403 CSRF →
  reobtener token y reintentar. `cache: "no-store"`. Una vez abierto el stream, no se renueva a mitad:
  la petición ya está autenticada.
- **Parser SSE** (`lib/api/sse.ts`): `ReadableStream` + `TextDecoder(stream:true)`, acumular buffer y
  cortar por `\n\n`; ignorar comentarios `:`; concatenar líneas `data:`; `JSON.parse`; emitir
  `{event, data}`. Soporta frames partidos entre chunks y varios frames por chunk. Al cerrar sin
  `final`/`error` → interrupción (RF-29).
- **Máquina de estados** en `TrainingPanel`: `idle → starting → live → finished|cancelled|interrupted|error`.
  - `start`: muestra épocas planificadas, filas train/test.
  - `epoch`: acumula y pinta época actual/total + curva; lotes de render cada ≤100 ms con `requestAnimationFrame`
    para no re-renderizar 10 000 veces (RNF-1 sigue holgado).
  - `final`: run con métricas, refrescar red y runs.
  - `error`: código/mensaje de la API; estado final real.
  - Cancelar: `AbortController.abort()`; distinguir cancelación del usuario (RF-27) de fallo de red (RF-29).
- **Guarda de navegación** (RF-32): mientras `live`, `beforeunload` para recarga/cierre, intercepción de
  clics en enlaces internos y centinela de historial + `popstate` para el botón atrás. Si el usuario
  confirma, se aborta y se navega; si cancela, se restaura la entrada. `NavigationGuard` recibe el estado
  por contexto; al desmontar sin confirmación, aborta como red de seguridad.
- **Chart** (`LossChart`): SVG responsive con series train/test, ejes época/pérdida, leyenda y resumen
  textual accesible. Para >2 000 épocas se dibuja una muestra por stride (la serie completa permanece en
  estado); el downsample es solo visual.
- **One-shot**: `fetch` normal, estado de espera sin épocas/curva simuladas (RF-31); al volver, mismo
  tratamiento de éxito/error que el final del stream.
- **Concurrencia**: un 409 se muestra y refresca el estado de la red; no se abre stream. StrictMode no
  arranca streams en efectos: solo por acción del usuario.

## 7. Comportamiento por pantalla (cobertura de RF)

- **Redes (RF-9..15)**: formulario controlado con nombre, capas ordenadas (añadir/quitar/subir/bajar,
  tamaño 1..2048, activación), épocas, lr, pérdida, split y semilla opcional. Límites de UI 2..20 capas
  como ayuda, pero la API manda (RN-4). Semilla vacía en alta se omite (la API genera); en edición se
  muestra la efectiva y no se puede "vaciar" (PATCH solo cambia si se envía). `TopologyPreview` dibuja
  capas/conexiones con un máximo de ~12 nodos visuales por capa y etiqueta el tamaño real; sin cálculo.
  Guardar sobre `trained` → confirmación (RF-12). Borrar → confirmación; 409/404 → motivo + refresco.
- **Datasets (RF-16..22)**: tipo CSV (string + `input_cols`) o JSON (objeto parseado; el archivo se lee
  como texto y se parsea antes de enviar). Pegado o archivo local. Reporte de violaciones en tabla
  (fila/columna/motivo, hasta 100 + total). Detalle con contenido bajo demanda: CSV primeras 200 filas,
  JSON primeros 100 ejemplos; descarga con el contenido íntegro y extensión según tipo. Fallo de carga →
  reintento sin contenido parcial; borrar → confirmación.
- **Entrenamiento (RF-23..32)**: selector de dataset propio y modalidad (vivo por defecto); lanza con la
  configuración guardada. Progreso/curva/cancelación/guardas según §6. Éxito → run + entrenada;
  interrupción/errores → mensajes y estado reales.
- **Corridas (RF-33..34)**: lista desc de la API con métricas y snapshot del dataset; selección de 2..4
  (la quinta se rechaza con aviso, RN-12) y comparación lado a lado; selección efímera (RN-6).
- **Predicción (RF-35..36)**: campo de texto para el vector (valores separados por comas/espacios, con
  contador y longitud esperada = tamaño de la primera capa) en vez de generar hasta 2048 inputs; parseo a
  números, envío y salida en orden. 409/422 → motivo, sin salida local.
- **Pesos (RF-37..38)**: descarga directa como blob vía `apiFetch` con credenciales (sin parsear hasta
  50 MB) con nombre `red-<id>.json`; 409/413/red → motivo y ningún archivo.
- **Presentación**: textos en español; estados vacíos con CTA; tablas con scroll interno; diálogos nativos
  con foco atrapado; etiquetas, `aria-invalid`/`aria-describedby` y foco visible (RNF-6). Responsive
  360–1920 px con sidebar colapsable y previsualización vertical en móvil (RNF-4).

## 8. Tests y verificación

- **Backend (puerta obligatoria)**: tests nuevos de cookie-only en `users/tests.py`: cookies y flags,
  ausencia de tokens en JSON, `/csrf`, `/me`, refresh por cookie, logout, CSRF 403 y exención Bearer;
  `manage.py check` y suite completa verde (168 + nuevos). No se toca ningún otro contrato.
- **Frontend unitario (Vitest)**: parser SSE (frames partidos, múltiples por chunk, final/error/incompleto),
  bootstrap CSRF, refresh single-flight + reintento único + fallo, 403 CSRF + reintento único, ausencia de
  `localStorage`/`sessionStorage`, normalización de errores (string/lista/dict), mapeo de payloads de
  dataset (CSV string / JSON objeto) y de respuestas de auth sin tokens.
- **Build**: `npm run lint`, `npm run build` (incluye typecheck) y `npm test` en `frontend/`; añadir
  `fe_lint`, `fe_build`, `fe_test` a `rav.yaml`.
- **E2E manual guiado** (backend uvicorn + Redis + frontend en `localhost:3000`): CU-1..CU-9 con dos
  usuarios; cookies HttpOnly visibles en DevTools y ausentes de `document.cookie`/storage; recarga
  mantiene sesión; logout limpia cookies; CSRF omitido → 403; expiración de access (forzar TTL corto) →
  refresh transparente; fallo de refresh → login conservando ruta; ambos modos de entrenamiento;
  cancelación; corte de red (DevTools offline) → aviso y relanzamiento; recarga/cierre y botón atrás
  durante vivo; dataset inválido/413; red entrenada editada; comparación de 4; predicción; pesos;
  responsive 360/768/1280/1920; recorrido solo con teclado; consola limpia.
- **RNF**: RNF-1 instrumentando recepción de evento→pintado en la corrida de referencia; RNF-2 con red de
  20 capas; RNF-3 inspeccionando flags de cookies, `document.cookie`, storage, URL/DOM/mensajes; RNF-4
  midiendo `scrollWidth` a los cuatro anchos; RNF-5 revisando consola durante el E2E.
- No se añade Playwright en F6: la verificación de navegador es manual y trazable; la lógica delicada
  (parser, refresh, errores) queda cubierta por Vitest. Si el dueño quiere automatizar navegador, se
  decide aparte.

## 9. Orden de implementación

1. **Precondición**: Node 22 LTS con nvm, scaffold `frontend/` (Next 16.4.6 + TS + Tailwind + ESLint +
   src/ + alias `@/*`), fijar versiones, `.env.local.example`, `npm run build` inicial.
2. **Backend sesión cookie-only**: helpers de cookies, `CookieJWTAuth`, CSRF, esquemas y endpoints
   (`/csrf`, `/me`, `/refresh`, `/logout`), CORS con credenciales, tests; suite verde.
3. **Base de sesión**: tipos API, bootstrap CSRF, `apiFetch` con credenciales, refresh single-flight,
   `SessionProvider`, `AuthGuard`, login/register, rutas protegidas y logout.
4. **Shell y panel**: layout responsive, navegación, estados vacíos, panel `/`.
5. **Redes**: lista, alta/edición, `TopologyPreview`, confirmaciones, borrado, errores.
6. **Datasets**: alta CSV/JSON, reporte, lista, detalle, vista previa/descarga, borrado.
7. **Entrenamiento**: selector/modalidad, parser SSE, panel en vivo, chart, cancelación, guardas,
   one-shot, resultados y refresco de estado/runs.
8. **Corridas/predicción/pesos**: lista/comparación 2..4, predicción, descarga de pesos.
9. **Pulido y cierre**: responsive, accesibilidad, seguridad (cookies HttpOnly, CSRF, sin tokens en
   URL/storage), tests Vitest, `lint`/`build`, E2E manual, RNF, `rav.yaml`, `AGENTS.md` (§4 versiones,
   §5 estructura, §8 sesión cookie-only, §11 comandos, §12 F6, §14 decisiones).

Cada bloque cierra con build/tests verdes y una comprobación concreta; no se pasa al siguiente con la
suite rota.

## 10. Riesgos y decisiones del plan

- **Node 22 no instalado**: `nvm list` está vacío y el sistema tiene 24.18.0. Se instala 22 LTS; usar 24
  sin aprobación sería cambiar §4 en silencio.
- **Host de cookies**: `localhost` y `127.0.0.1` son hosts distintos; mezclarlos rompe sesión y CSRF.
  Se fija `localhost` en frontend/API y se documenta en `.env.local.example`. En producción, si frontend
  y API no son del mismo sitio, `SameSite=None` exige `Secure` y cookies de terceros.
- **CSRF**: la cookie HttpOnly no se lee desde JS; el token se obtiene de `/csrf` y vive en memoria. Hay
  que reobtenerlo tras recarga y ante 403. Si el bootstrap falla, las escrituras se bloquean con aviso;
  nunca se reintenta una escritura indefinidamente.
- **Logout/refresh sin revocación**: no hay blacklist; el refresh vive hasta 7 días y una cookie robada
  fuera del navegador seguiría válida. Aceptado por alcance; se documenta en §14.
- **Cambio breaking de login/register**: dejan de devolver tokens; clientes externos y tests que los
  esperaban se actualizan. Aprobado en la enmienda cookie-only.
- **TTL**: no se guarda TTL en el cliente; las vidas de los JWT siguen en el servidor (access 120/15 min,
  refresh 1/7 días) y las cookies llevan `Max-Age`. Si «ni TTL» significaba eliminar la expiración, no se
  asume: exigiría una decisión explícita porque alarga indefinidamente el riesgo de una cookie robada.
- **Guarda de navegación**: el botón atrás en App Router no es cancelable de forma nativa; se usa centinela
  de historial. Si resulta frágil, la red de seguridad es abortar al desmontar (pierde la confirmación,
  nunca deja un stream huérfano). Debe probarse en el E2E.
- **10 000 épocas**: pintar cada evento es inviable; el lote de render y el downsample visual evitan
  bloqueos sin alterar los datos mostrados.
- **Límites grandes**: preview 200/100 y descarga de pesos como blob evitan congelar con 5 MB/50 MB.
- **StrictMode**: doble montaje en dev; los fetch llevan cancelación/ignore y los streams solo nacen de
  acciones del usuario.
- **Streaming y proxies**: se consume contra uvicorn directo en dev; si un proxy bufferiza, el stream se
  vería a ráfagas. No hay GZip en la cadena actual; verificar `Content-Type` en el E2E.
- **CORS con credenciales**: no se puede usar `*`; orígenes exactos y `CORS_ALLOW_CREDENTIALS=True`.
  Dev lista `localhost:3000`; producción debe listar su origen antes de desplegar. Preflight debe permitir
  `X-CSRFToken`.
- **Versiones**: TypeScript 5.9.3/Tailwind 4.3.5 fijadas; no se instalan kits de UI ni charts sin registrar
  la decisión.
- **Sin E2E automatizado**: aceptado para F6; los RFs se verifican manualmente y la lógica pura por tests.

## 11. Criterios de cierre

- [x] Sesión cookie-only implementada y probada (`/csrf`, `/me`, `/refresh`, `/logout`, CSRF, CORS con
      credenciales); login/register sin tokens en JSON; suite backend completa verde.
- [x] Sin `localStorage`/`sessionStorage` para credenciales; cookies HttpOnly verificadas en E2E.
- [x] Los 38 RF verificados contra el E2E manual (evidencia por RF en `tasks.md`).
- [x] RNF-1..RNF-6 medidos y dentro de umbral.
- [x] `npm run lint`, `npm run build`, `npm test` verdes; `rav` actualizado.
- [x] Responsive 360–1920, teclado/foco/etiquetas y consola limpia.
- [x] `AGENTS.md` actualizado (versiones, estructura, API, comandos, F6 y §14) sin contradicciones.
- [x] Spec 003 sigue siendo la fuente de verdad: ningún requisito nuevo fuera de ella.
