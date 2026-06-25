import { describe, it, expect } from "vitest";
import { dinero, sumar, multiplicar, formatear, fromString } from "./dinero";

describe("dinero", () => {
  it("suma sin errores de float", () => {
    const a = dinero("0.10");
    const b = dinero("0.20");
    expect(sumar(a, b).toString()).toBe("0.3");
  });

  it("multiplica precio por cantidad", () => {
    const precio = dinero("8.50");
    expect(multiplicar(precio, 3).toString()).toBe("25.5");
  });

  it("formatea con 2 decimales y prefijo S/", () => {
    expect(formatear(dinero("8.5"))).toBe("S/ 8.50");
    expect(formatear(dinero("0"))).toBe("S/ 0.00");
  });

  it("fromString tolera string vacío con default 0", () => {
    expect(fromString("").toString()).toBe("0");
    expect(fromString("12.34").toString()).toBe("12.34");
  });
});
