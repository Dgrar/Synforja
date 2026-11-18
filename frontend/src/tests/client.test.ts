import { afterEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function routeOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

function optionsOf(call: unknown[]): RequestInit {
  return call[1] as RequestInit;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("apiFetch", () => {
  it("envía credenciales y no añade Authorization en lecturas", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: 1 }]));
    vi.stubGlobal("fetch", fetchMock);

    const { apiFetch } = await import("@/lib/api/client");
    await expect(apiFetch("/networks")).resolves.toEqual([{ id: 1 }]);

    const options = optionsOf(fetchMock.mock.calls[0]);
    const headers = new Headers(options.headers);
    expect(options.credentials).toBe("include");
    expect(options.cache).toBe("no-store");
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.has("X-CSRFToken")).toBe(false);
  });

  it("obtiene CSRF y adjunta JSON en escrituras", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (routeOf(input).endsWith("/users/csrf")) {
        return jsonResponse({ csrf_token: "csrf-a" });
      }
      return jsonResponse({ id: 3 }, 201);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { apiFetch } = await import("@/lib/api/client");
    await apiFetch("/networks", { method: "POST", body: { name: "xor" } });

    const request = fetchMock.mock.calls.find((call) =>
      routeOf(call[0]).endsWith("/api/networks"),
    );
    if (!request) {
      throw new Error("No se envió la petición de red");
    }

    const options = optionsOf(request);
    const headers = new Headers(options.headers);
    expect(headers.get("X-CSRFToken")).toBe("csrf-a");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(options.body))).toEqual({ name: "xor" });
  });

  it("reobtiene CSRF y reintenta una sola vez un 403", async () => {
    let csrfCalls = 0;
    let writeCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (routeOf(input).endsWith("/users/csrf")) {
        csrfCalls += 1;
        return jsonResponse({ csrf_token: `csrf-${csrfCalls}` });
      }
      writeCalls += 1;
      return writeCalls === 1
        ? jsonResponse({ detail: "Token CSRF inválido" }, 403)
        : jsonResponse({ id: 4 }, 201);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { apiFetch } = await import("@/lib/api/client");
    await expect(
      apiFetch("/networks", { method: "POST", body: { name: "xor" } }),
    ).resolves.toEqual({ id: 4 });
    expect(csrfCalls).toBe(2);
    expect(writeCalls).toBe(2);
  });

  it("un 401 privado refresca y reintenta una sola vez", async () => {
    let writes = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = routeOf(input);
      if (url.endsWith("/users/csrf")) {
        return jsonResponse({ csrf_token: "csrf-a" });
      }
      if (url.endsWith("/users/refresh")) {
        return new Response(null, { status: 200 });
      }
      writes += 1;
      return writes === 1
        ? jsonResponse({ detail: "Sesión caducada" }, 401)
        : jsonResponse([{ id: 2 }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { apiFetch } = await import("@/lib/api/client");
    await expect(apiFetch("/networks")).resolves.toEqual([{ id: 2 }]);
    expect(writes).toBe(2);
  });
});
