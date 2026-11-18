import { describe, expect, it } from "vitest";

import {
  parseCsvPreview,
  parseJsonPreview,
} from "@/lib/datasets/preview";

describe("parseCsvPreview", () => {
  it("parsea comas, comillas escapadas y CRLF", () => {
    const preview = parseCsvPreview('1,"dos, con coma"\r\n3,"di ""hola"""\r\n');

    expect(preview.rows).toEqual([
      ["1", "dos, con coma"],
      ["3", 'di "hola"'],
    ]);
    expect(preview.truncated).toBe(false);
  });

  it("respeta un salto de línea dentro de comillas", () => {
    const preview = parseCsvPreview('1,"dos\nlineas"\n3,4\n');

    expect(preview.rows).toEqual([
      ["1", "dos\nlineas"],
      ["3", "4"],
    ]);
  });

  it("limita la vista previa y marca el truncado", () => {
    const content = "1,2\n3,4\n5,6\n";
    const preview = parseCsvPreview(content, 2);

    expect(preview.rows).toHaveLength(2);
    expect(preview.truncated).toBe(true);
  });

  it("no añade una fila vacía al final", () => {
    const preview = parseCsvPreview("1,2\n3,4\n");

    expect(preview.rows).toHaveLength(2);
    expect(preview.truncated).toBe(false);
  });
});

describe("parseJsonPreview", () => {
  it("extrae inputs y expects hasta el límite", () => {
    const content = JSON.stringify({
      inputs: [
        [0, 0],
        [0, 1],
        [1, 0],
      ],
      expects: [[0], [1], [1]],
    });
    const preview = parseJsonPreview(content, 2);

    expect(preview.rows).toEqual([
      { inputs: [0, 0], expects: [0] },
      { inputs: [0, 1], expects: [1] },
    ]);
    expect(preview.truncated).toBe(true);
  });

  it("rechaza un JSON sin los bloques esperados", () => {
    expect(() =>
      parseJsonPreview('{"inputs":[[1]],"otros":[]}'),
    ).toThrow("inputs y expects");
  });

  it("rechaza un JSON que no es un objeto", () => {
    expect(() => parseJsonPreview("[]")).toThrow("inputs y expects");
  });
});
