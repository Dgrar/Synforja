import { describe, expect, it } from "vitest";

import { parseJsonBody } from "@/lib/api/http";

describe("parseJsonBody", () => {
  it("conserva como string una semilla mayor que MAX_SAFE_INTEGER", () => {
    const parsed = parseJsonBody(
      '{"id":1,"seed":9223372036854775807,"name":"xor"}',
    ) as { id: number; seed: string; name: string };

    expect(parsed).toEqual({
      id: 1,
      seed: "9223372036854775807",
      name: "xor",
    });
  });

  it("conserva números seguros, decimales y exponentes", () => {
    const parsed = parseJsonBody(
      '{"small":42,"decimal":0.5,"exponent":1e10,"negative":-12}',
    );

    expect(parsed).toEqual({
      small: 42,
      decimal: 0.5,
      exponent: 1e10,
      negative: -12,
    });
  });

  it("no altera números dentro de strings", () => {
    const parsed = parseJsonBody(
      '{"label":"9223372036854775807","seed":9223372036854775807}',
    ) as { label: string; seed: string };

    expect(parsed.label).toBe("9223372036854775807");
    expect(parsed.seed).toBe("9223372036854775807");
  });

  it("conserva la precisión de una semilla negativa grande", () => {
    const parsed = parseJsonBody(
      '{"seed":-9223372036854775807}',
    ) as { seed: string };

    expect(parsed.seed).toBe("-9223372036854775807");
  });
});
