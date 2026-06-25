import { describe, it, expect } from "vitest";
import { puedeTransicionarPedido } from "./state";

describe("pedido.puedeTransicionarPedido", () => {
  it("confirmado → en_preparacion", () => {
    expect(puedeTransicionarPedido("CONFIRMADO", "EN_PREPARACION")).toBe(true);
  });
  it("en_preparacion → listo", () => {
    expect(puedeTransicionarPedido("EN_PREPARACION", "LISTO")).toBe(true);
  });
  it("listo → entregado", () => {
    expect(puedeTransicionarPedido("LISTO", "ENTREGADO")).toBe(true);
  });
  it("cancelado es terminal", () => {
    expect(puedeTransicionarPedido("CANCELADO", "ENTREGADO")).toBe(false);
  });
  it("entregado es terminal", () => {
    expect(puedeTransicionarPedido("ENTREGADO", "CANCELADO")).toBe(false);
  });
  it("listo NO puede cancelarse", () => {
    expect(puedeTransicionarPedido("LISTO", "CANCELADO")).toBe(false);
  });
});
