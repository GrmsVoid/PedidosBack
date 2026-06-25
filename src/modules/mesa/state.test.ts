import { describe, it, expect } from "vitest";
import { puedeTransicionarMesa } from "./state";
import { MesaEstado } from "@prisma/client";

describe("mesa.puedeTransicionarMesa", () => {
  it("LIBRE → OCUPADA permitido", () => {
    expect(puedeTransicionarMesa(MesaEstado.LIBRE, MesaEstado.OCUPADA)).toBe(true);
  });
  it("LIBRE → UNIDA permitido", () => {
    expect(puedeTransicionarMesa(MesaEstado.LIBRE, MesaEstado.UNIDA)).toBe(true);
  });
  it("OCUPADA → LIBRE permitido", () => {
    expect(puedeTransicionarMesa(MesaEstado.OCUPADA, MesaEstado.LIBRE)).toBe(true);
  });
  it("UNIDA → LIBRE permitido", () => {
    expect(puedeTransicionarMesa(MesaEstado.UNIDA, MesaEstado.LIBRE)).toBe(true);
  });
  it("OCUPADA → UNIDA prohibido (no se une mesa con cuenta abierta)", () => {
    expect(puedeTransicionarMesa(MesaEstado.OCUPADA, MesaEstado.UNIDA)).toBe(false);
  });
});
