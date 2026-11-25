import { describe, expect, it } from "vitest";

import { MAX_COMPARE_RUNS, toggleRunSelection } from "@/lib/runs/compare";

describe("selección de corridas", () => {
  it("añade y quita una corrida sin tocar las demás", () => {
    const added = toggleRunSelection([1], 2);
    expect(added).toEqual({ selected: [1, 2], rejected: false });

    const removed = toggleRunSelection([1, 2], 1);
    expect(removed).toEqual({ selected: [2], rejected: false });
  });

  it("no duplica una corrida ya seleccionada", () => {
    expect(toggleRunSelection([3], 3)).toEqual({ selected: [], rejected: false });
  });

  it("rechaza la quinta selección sin alterar la selección", () => {
    const full = [1, 2, 3, MAX_COMPARE_RUNS];
    const result = toggleRunSelection(full, 5);

    expect(result.rejected).toBe(true);
    expect(result.selected).toEqual(full);
  });

  it("permite volver a seleccionar tras liberar un hueco", () => {
    const full = [1, 2, 3, 4];
    const released = toggleRunSelection(full, 2);
    expect(released.rejected).toBe(false);

    const next = toggleRunSelection(released.selected, 5);
    expect(next.rejected).toBe(false);
    expect(next.selected).toEqual([1, 3, 4, 5]);
  });
});
