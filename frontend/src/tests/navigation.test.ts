import { describe, expect, it } from "vitest";

import { loginPath, safeNextPath } from "@/lib/navigation";

describe("navegación segura", () => {
  it("rechaza URLs externas y protocol-relative", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example/path")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });

  it("conserva rutas internas con query", () => {
    expect(safeNextPath("/networks?tab=active")).toBe("/networks?tab=active");
  });

  it("no añade next para la raíz", () => {
    expect(loginPath("/")).toBe("/login");
    expect(loginPath("/networks/3")).toContain(
      "next=%2Fnetworks%2F3",
    );
  });
});
