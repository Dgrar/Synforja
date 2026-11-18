import { afterEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("csrf", () => {
  it("comparte una sola petición durante el bootstrap", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ csrf_token: "csrf-a" }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchCsrfToken, resetCsrfToken } = await import(
      "@/lib/session/csrf"
    );
    resetCsrfToken();

    const [first, second] = await Promise.all([
      fetchCsrfToken(),
      fetchCsrfToken(),
    ]);

    expect(first).toBe("csrf-a");
    expect(second).toBe("csrf-a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: "include",
      cache: "no-store",
    });
  });

  it("fuerza una nueva petición después de un 403 CSRF", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "csrf-a" }))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "csrf-b" }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchCsrfToken, resetCsrfToken } = await import(
      "@/lib/session/csrf"
    );
    resetCsrfToken();

    expect(await fetchCsrfToken()).toBe("csrf-a");
    expect(await fetchCsrfToken(true)).toBe("csrf-b");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
