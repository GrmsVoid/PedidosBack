import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startE2E, type E2ECtx } from "./helpers/server";
import { firmarTokenMesa } from "@/lib/qr";

let ctx: E2ECtx;

describe("E2E flujo cliente completo (supertest)", () => {
  beforeAll(async () => {
    ctx = await startE2E();
  }, 120_000);
  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it("escanea QR → arma pedido → estado → llama mozo + throttle", async () => {
    const mesa = await ctx.db.prisma.mesa.findFirstOrThrow();
    const qrToken = await firmarTokenMesa({ mesaId: mesa.id, localId: "demo-local", keyId: "v1" });

    // 1) Abrir sesión
    const r1 = await ctx.request.post(`/api/sesion/mesa/${mesa.id}`).send({ qrToken });
    expect(r1.status).toBe(200);
    const sessionToken = r1.body.sessionToken as string;
    expect(r1.body.sesionId).toBeDefined();

    // 2) Crear pedido (cappuccino 12oz deslactosada)
    const r2 = await ctx.request
      .post("/api/pedidos")
      .set("authorization", `Bearer ${sessionToken}`)
      .send({
        items: [
          {
            productoId: "demo-prod-cappuccino",
            cantidad: 1,
            opcionesIds: ["demo-tam-12oz", "demo-leche-deslactosada"],
            notaLibre: null,
          },
        ],
      });
    expect(r2.status).toBe(201);

    // 3) Consultar sesión actual
    const r3 = await ctx.request
      .get("/api/sesion/actual")
      .set("authorization", `Bearer ${sessionToken}`);
    expect(r3.status).toBe(200);
    expect(Number(r3.body.total)).toBeGreaterThan(0);

    // 4) Llamar al mozo
    const r4 = await ctx.request
      .post("/api/sesion/llamar-mozo")
      .set("authorization", `Bearer ${sessionToken}`);
    expect(r4.status).toBe(201);

    // 5) Re-llamar dentro del throttle → 429
    const r4b = await ctx.request
      .post("/api/sesion/llamar-mozo")
      .set("authorization", `Bearer ${sessionToken}`);
    expect(r4b.status).toBe(429);
  });
});
