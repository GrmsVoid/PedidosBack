import { describe, it, expect } from "vitest";
import { dividirEnComensales, restanteEnSesion } from "./service";

describe("pago.dividirEnComensales", () => {
  it("divide 30.00 entre 3 en partes iguales", () => {
    const partes = dividirEnComensales("30.00", 3);
    expect(partes).toEqual(["10.00", "10.00", "10.00"]);
  });
  it("divide 10.00 entre 3 con redondeo al último", () => {
    const partes = dividirEnComensales("10.00", 3);
    expect(partes[0]).toBe("3.33");
    expect(partes[1]).toBe("3.33");
    expect(partes[2]).toBe("3.34");
  });
});

describe("pago.restanteEnSesion", () => {
  it("total 30, pagado 12 → restante 18", () => {
    expect(restanteEnSesion("30.00", ["10.00", "2.00"])).toBe("18.00");
  });
  it("pagado más que total → 0", () => {
    expect(restanteEnSesion("30.00", ["20.00", "15.00"])).toBe("0.00");
  });
});
