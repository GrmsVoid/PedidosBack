import { describe, it, expect } from "vitest";
import { hasAnyRole } from "./authorize";
import type { RolCodigo } from "@prisma/client";

describe("authorize.hasAnyRole", () => {
  it("permite si el usuario tiene uno de los roles requeridos", () => {
    const roles: RolCodigo[] = ["MOZO", "CAJERO"];
    expect(hasAnyRole(roles, ["CAJERO"])).toBe(true);
    expect(hasAnyRole(roles, ["ADMIN", "MOZO"])).toBe(true);
  });

  it("rechaza si no hay intersección", () => {
    const roles: RolCodigo[] = ["BARISTA"];
    expect(hasAnyRole(roles, ["ADMIN"])).toBe(false);
  });

  it("rechaza si no hay roles del usuario", () => {
    expect(hasAnyRole([], ["ADMIN"])).toBe(false);
  });
});
