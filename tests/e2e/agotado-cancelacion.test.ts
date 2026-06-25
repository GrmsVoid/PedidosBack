import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startE2E, type E2ECtx } from "./helpers/server";

let ctx: E2ECtx;

describe("E2E agotado + cancelación", () => {
  beforeAll(async () => {
    ctx = await startE2E();
  }, 180_000);
  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it("producto agotado → POST pedido devuelve PRODUCT_UNAVAILABLE", async () => {
    const { sesionService } = await import("@/modules/sesion/service");
    const { pedidoService } = await import("@/modules/pedido/service");
    const { ErrorCode } = await import("@/lib/errors");

    const mesa = await ctx.db.prisma.mesa.findFirstOrThrow();
    const sesion = await sesionService.abrirOAdjuntar("demo-local", mesa.id);

    // Agotar cappuccino
    await ctx.db.prisma.producto.update({
      where: { id: "demo-prod-cappuccino" },
      data: { disponible: false },
    });

    await expect(
      pedidoService.crear({
        sesionId: sesion.id,
        origen: "CLIENTE",
        creadoPor: null,
        items: [
          {
            productoId: "demo-prod-cappuccino",
            cantidad: 1,
            opcionesIds: ["demo-tam-8oz", "demo-leche-entera"],
            notaLibre: null,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: ErrorCode.PRODUCT_UNAVAILABLE });

    // Restaurar
    await ctx.db.prisma.producto.update({
      where: { id: "demo-prod-cappuccino" },
      data: { disponible: true },
    });
  });

  it("pedido EN_PREPARACION → mozo cancela → estado CANCELADO con motivo", async () => {
    const { sesionService } = await import("@/modules/sesion/service");
    const { pedidoService } = await import("@/modules/pedido/service");
    const mesas = await ctx.db.prisma.mesa.findMany({ take: 3 });
    const mesa = mesas[2];
    const usuario = await ctx.db.prisma.usuario.findFirstOrThrow();

    const sesion = await sesionService.abrirOAdjuntar("demo-local", mesa.id);
    const pedido = await pedidoService.crear({
      sesionId: sesion.id,
      origen: "CLIENTE",
      creadoPor: null,
      items: [
        {
          productoId: "demo-prod-brownie",
          cantidad: 1,
          opcionesIds: [],
          notaLibre: null,
        },
      ],
    });
    await pedidoService.transicionar(pedido.id, "EN_PREPARACION");
    await pedidoService.transicionar(pedido.id, "CANCELADO", {
      motivo: "Cliente cambió de opinión",
      actor: usuario.id,
    });
    const refresh = await ctx.db.prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(refresh.estado).toBe("CANCELADO");
    expect(refresh.canceladoMotivo).toBe("Cliente cambió de opinión");

    const evt = await ctx.db.prisma.eventoSesion.findFirst({
      where: { sesionId: sesion.id, tipo: "PEDIDO_CANCELADO" },
    });
    expect(evt).toBeDefined();
  });
});
