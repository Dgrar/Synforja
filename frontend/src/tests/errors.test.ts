import { describe, expect, it } from "vitest";

import { normalizeApiError } from "@/lib/api/errors";

describe("normalizeApiError", () => {
  it("conserva un detail string", () => {
    const error = normalizeApiError(409, { detail: "Ya existe" });
    expect(error.status).toBe(409);
    expect(error.detail).toBe("Ya existe");
  });

  it("mapea la lista de validación de Ninja a campos", () => {
    const error = normalizeApiError(422, [
      {
        loc: ["body", "payload", "username"],
        msg: "String should have at least 1 character",
        type: "string_too_short",
      },
    ]);

    expect(error.fields).toEqual({
      username: "String should have at least 1 character",
    });
    expect(error.detail).toBe("Revisa los datos del formulario.");
  });

  it("mapea el reporte de violaciones de datasets", () => {
    const error = normalizeApiError(422, {
      detail: {
        total: 2,
        violations: [
          { row: 1, col: 1, reason: "fila vacía" },
          { row: 3, col: 2, reason: "no numérico" },
        ],
      },
    });

    expect(error.total).toBe(2);
    expect(error.violations).toHaveLength(2);
    expect(error.detail).toContain("2 violaciones");
  });

  it("usa mensajes de casa para 413/429", () => {
    expect(normalizeApiError(413, null).detail).toContain("tamaño");
    expect(normalizeApiError(429, null).detail).toContain("Demasiados");
  });
});
