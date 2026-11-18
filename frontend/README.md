# Synforja · Frontend

Interfaz Next.js 16 (App Router) para diseñar, entrenar y ejecutar redes neuronales simples.
El frontend no calcula la red: consume la API de Django y muestra sus respuestas.

## Requisitos

- Node.js **22.23.5** (`.nvmrc`).
- Backend en `http://localhost:8000` y Redis para el throttling de la API.
- Usa el mismo host en frontend y API (`localhost` o `127.0.0.1`) para que las cookies
  HttpOnly se compartan.

## Desarrollo

```powershell
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Abre `http://localhost:3000`.

### Node con nvm en esta máquina

La instalación global puede seguir apuntando a Node 24. Para esta terminal:

```powershell
$env:PATH = "C:\Users\Roberto\AppData\Local\Author Software\nvm\installs\v22.23.5;" + $env:PATH
node --version
```

## Verificación

```powershell
npm test        # Vitest: sesión, CSRF, API, formularios y previews de datasets
npm run lint
npm run build   # incluye typecheck
```

## Variables

| Variable | Valor por defecto |
|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` |

No se guardan tokens en `localStorage` ni `sessionStorage`: la sesión vive en cookies
HttpOnly y el CSRF en memoria durante la sesión de la pestaña.
