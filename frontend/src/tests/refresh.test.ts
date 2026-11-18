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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("refreshSession", () => {
  it("single-flight: dos llamadas comparten un único refresh", async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (routeOf(input).endsWith("/users/csrf")) {
        return jsonResponse({ csrf_token: "csrf-a" });
      }
      if (routeOf(input).endsWith("/users/refresh")) {
        refreshCalls += 1;
        return new Response(null, { status: 200 });
      }
      throw new Error(`URL inesperada: ${routeOf(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { refreshSession } = await import("@/lib/session/refresh");
    const results = await Promise.all([refreshSession(), refreshSession()]);

    expect(results).toEqual([true, true]);
    expect(refreshCalls).toBe(1);
  });

  it("emite sesión expirada una sola vez ante refresh 401", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (routeOf(input).endsWith("/users/csrf")) {
        return jsonResponse({ csrf_token: "csrf-a" });
      }
      return jsonResponse({ detail: "Refresh caducado" }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    const events = await import("@/lib/session/events");
    const { refreshSession } = await import("@/lib/session/refresh");
    const listener = vi.fn();
    const unsubscribe = events.onSessionExpired(listener);

    await expect(refreshSession()).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("reobtiene CSRF y reintenta una vez ante 403", async () => {
    let csrfCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (routeOf(input).endsWith("/users/csrf")) {
        csrfCalls += 1;
        return jsonResponse({ csrf_token: `csrf-${csrfCalls}` });
      }
      if (routeOf(input).endsWith("/users/refresh")) {
        refreshCalls += 1;
        if (refreshCalls === 1) {
          return jsonResponse({ detail: "Token CSRF inválido" }, 403);
        }
        return new Response(null, { status: 200 });
      }
      throw new Error(`URL inesperada: ${routeOf(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { refreshSession } = await import("@/lib/session/refresh");

    await expect(refreshSession()).resolves.toBe(true);
    expect(csrfCalls).toBe(2);
    expect(refreshCalls).toBe(2);
  });
});
