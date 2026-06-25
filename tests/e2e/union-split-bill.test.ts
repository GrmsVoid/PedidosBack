import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startE2E, type E2ECtx } from "./helpers/server";

let ctx: E2ECtx;

describe("E2E unión de mesas + split bill", () => {
  beforeAll(async () => {
    ctx = await startE2E();
  }, 180_000);
  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it("une 2 mesas libres → pedido → divide en 3 pagos → cierra", async () => {
    const { sesionService } = await import("@/modules/sesion/service");
    const { pedidoService } = await import("@/modules/pedido/service");
    const { pagoService, dividirEnComensales } = await import("@/modules/pago/service");

    const [m1, m2] = await ctx.db.prisma.mesa.findMany({ take: 2 });
    const usuario = await ctx.db.prisma.usuario.findFirstOrThrow();

    // Unir
    const sesion = await sesionService.unirMesas("demo-local", [m1.id, m2.id]);

    // Pedido por mozo
    await pedidoService.crear({
      sesionId: sesion.id,
      origen: "MOZO",
      creadoPor: usuario.id,
      items: [
        {
          productoId: "demo-prod-cappuccino",
          cantidad: 3,
          opcionesIds: ["demo-tam-8oz", "demo-leche-entera"],
          notaLibre: null,
        },
      ],
    });

    // Marcar listo y entregado
    const pedidos = await ctx.db.prisma.pedido.findMany({ where: { sesionId: sesion.id } });
    for (const p of pedidos) {
      await pedidoService.transicionar(p.id, "EN_PREPARACION");
      await pedidoService.transicionar(p.id, "LISTO");
      await pedidoService.transicionar(p.id, "ENTREGADO");
    }

    // Split bill: total 30.00 / 3 = 10.00 cada uno
    const total = await sesionService.calcularTotal(sesion.id);
    expect(total).toBe("30.00");
    const partes = dividirEnComensales(total, 3);
    let i = 1;
    for (const monto of partes) {
      await pagoService.registrar({
        sesionId: sesion.id,
        metodo: "EFECTIVO",
        monto,
        cajeroId: usuario.id,
        comensalNum: i++,
      });
    }

    await sesionService.cerrar(sesion.id, usuario.id);

    const mesasRefresh = await ctx.db.prisma.mesa.findMany({
      where: { id: { in: [m1.id, m2.id] } },
    });
    expect(mesasRefresh.every((m) => m.estado === "LIBRE")).toBe(true);
  });
});
