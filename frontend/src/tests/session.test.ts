import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { resolveSession } from "@/lib/session/bootstrap";
import type { User } from "@/lib/types/api";

const user: User = {
  id: 7,
  username: "ada",
  email: "ada@example.com",
};

describe("resolveSession", () => {
  it("usa /me sin refrescar cuando la cookie de acceso es válida", async () => {
    const getMe = vi.fn().mockResolvedValue(user);
    const refresh = vi.fn().mockResolvedValue(true);

    await expect(resolveSession({ getMe, refresh })).resolves.toEqual({
      status: "authenticated",
      user,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refresca una vez y reintenta /me si el acceso caducó", async () => {
    const getMe = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(401, "Sesión caducada"))
      .mockResolvedValueOnce(user);
    const refresh = vi.fn().mockResolvedValue(true);

    await expect(resolveSession({ getMe, refresh })).resolves.toEqual({
      status: "authenticated",
      user,
    });
    expect(getMe).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("trata un refresh 401 como sesión ausente", async () => {
    const getMe = vi.fn().mockRejectedValue(new ApiError(401, "Sin sesión"));
    const refresh = vi
      .fn()
      .mockRejectedValue(new ApiError(401, "Refresh caducado"));

    await expect(resolveSession({ getMe, refresh })).resolves.toEqual({
      status: "anonymous",
      reason: "expired",
    });
  });

  it("no cierra la sesión ante un fallo transitorio de refresh", async () => {
    const getMe = vi.fn().mockRejectedValue(new ApiError(401, "Sin sesión"));
    const refresh = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(resolveSession({ getMe, refresh })).rejects.toThrow(
      "network down",
    );
  });

  it("no interpreta un 500 de /me como sesión ausente", async () => {
    const getMe = vi.fn().mockRejectedValue(new ApiError(500, "Servidor"));
    const refresh = vi.fn().mockResolvedValue(true);

    await expect(resolveSession({ getMe, refresh })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
