import { Router } from "express";
import { requireRole } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { pagoService } from "@/modules/pago/service";
import { sesionService } from "@/modules/sesion/service";
import { pagoCreateSchema, cerrarSinPagoSchema } from "@/lib/schemas/pago";
import { runIdempotent } from "@/lib/idempotency";
import { route } from "./handler";

export const cajaRouter = Router();

cajaRouter.get(
  "/caja/sesiones-por-cobrar",
  route(async (req) => {
    await requireRole(req, ["CAJERO", "ADMIN"]);
    const data = await prisma.sesionMesa.findMany({
      where: {
        estado: "ABIERTA",
        pedidos: { some: { estado: { in: ["LISTO", "ENTREGADO"] } } },
      },
      include: { mesas: { include: { mesa: true } }, pedidos: true, pagos: true },
      orderBy: { abiertaEn: "asc" },
    });
    return { body: data };
  }),
);

cajaRouter.get(
  "/caja/sesion/:id/cuenta",
  route(async (req) => {
    await requireRole(req, ["CAJERO", "MOZO", "ADMIN"]);
    return { body: await pagoService.resumenCuenta(req.params.id) };
  }),
);

cajaRouter.post(
  "/caja/sesion/:id/pago",
  route(async (req) =>
    runIdempotent(
      req.header("idempotency-key") ?? null,
      "POST /api/caja/sesion/:id/pago",
      async () => {
        const { userId } = await requireRole(req, ["CAJERO", "ADMIN"]);
        const body = pagoCreateSchema.parse(req.body);
        const pago = await pagoService.registrar({
          sesionId: req.params.id,
          metodo: body.metodo,
          monto: body.monto,
          cajeroId: userId,
          comensalNum: body.comensalNum,
        });
        return { status: 201, body: pago };
      },
    ),
  ),
);

cajaRouter.post(
  "/caja/sesion/:id/cerrar",
  route(async (req) => {
    const { userId } = await requireRole(req, ["CAJERO", "ADMIN"]);
    return { body: await sesionService.cerrar(req.params.id, userId) };
  }),
);

cajaRouter.post(
  "/caja/sesion/:id/cerrar-sin-pago",
  route(async (req) => {
    const { userId } = await requireRole(req, ["CAJERO", "MOZO", "ADMIN"]);
    const { motivo } = cerrarSinPagoSchema.parse(req.body);
    return { body: await sesionService.cerrarSinPago(req.params.id, userId, motivo) };
  }),
);
