import { describe, expect, it } from "vitest";

import { parseVectorInput, vectorTokens } from "@/lib/predict/vector";

describe("parseVectorInput", () => {
  it("acepta comas, espacios y punto y coma", () => {
    expect(parseVectorInput("0,1 ; 2  3")).toEqual({
      values: [0, 1, 2, 3],
      error: null,
    });
  });

  it("conserva el orden, decimales y signos", () => {
    expect(parseVectorInput("-0.5, 2.25, -1e-3")).toEqual({
      values: [-0.5, 2.25, -0.001],
      error: null,
    });
  });

  it("rechaza un vector vacío", () => {
    const result = parseVectorInput("   ");
    expect(result.values).toBeNull();
    expect(result.error).toBe("Introduce al menos un valor.");
  });

  it("rechaza valores no numéricos indicando la posición", () => {
    const result = parseVectorInput("0, abc, 2");

    expect(result.values).toBeNull();
    expect(result.error).toContain("valor 2");
    expect(result.error).toContain("abc");
  });

  it("rechaza valores no finitos", () => {
    expect(parseVectorInput("0, Infinity").values).toBeNull();
    expect(parseVectorInput("NaN").values).toBeNull();
  });

  it("cuenta los valores introducidos sin convertirlos", () => {
    expect(vectorTokens("1, 2, 3")).toHaveLength(3);
    expect(vectorTokens("")).toHaveLength(0);
  });
});
