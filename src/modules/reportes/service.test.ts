import { describe, it, expect } from "vitest";
import { agruparPorHora, calcularTicketPromedio } from "./service";

describe("reportes utils", () => {
  it("agrupa pedidos por hora del día", () => {
    const pedidos = [
      { confirmadoEn: new Date("2026-06-18T09:15:00Z") },
      { confirmadoEn: new Date("2026-06-18T09:45:00Z") },
      { confirmadoEn: new Date("2026-06-18T13:00:00Z") },
    ] as Array<{ confirmadoEn: Date }>;
    const r = agruparPorHora(pedidos);
    expect(r[9]).toBe(2);
    expect(r[13]).toBe(1);
  });

  it("ticket promedio", () => {
    expect(calcularTicketPromedio(["10.00", "20.00", "30.00"])).toBe("20.00");
  });
});
