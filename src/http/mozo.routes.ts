import { Router } from "express";
import { z } from "zod";
import { requireRole } from "@/lib/authorize";
import { mesaRepo } from "@/modules/mesa/repository";
import { sesionService } from "@/modules/sesion/service";
import { pedidoService } from "@/modules/pedido/service";
import { eventosService } from "@/modules/eventos/service";
import { prisma } from "@/lib/prisma";
import { pedidoCreateSchema, cancelarSchema } from "@/lib/schemas/pedido";
import { AppError, ErrorCode } from "@/lib/errors";
import { route } from "./handler";

const DEMO_LOCAL_ID = "demo-local";
const unirSchema = z.object({ mesaIdsAdicionales: z.array(z.string().min(1)).min(1) });

export const mozoRouter = Router();

mozoRouter.get(
  "/mozo/mesas",
  route(async (req) => {
    await requireRole(req, ["MOZO", "CAJERO", "ADMIN"]);
    return { body: await mesaRepo.listarPorLocal(DEMO_LOCAL_ID) };
  }),
);

mozoRouter.get(
  "/mozo/sesiones",
  route(async (req) => {
    await requireRole(req, ["MOZO", "ADMIN"]);
    const data = await prisma.sesionMesa.findMany({
      where: { localId: DEMO_LOCAL_ID, estado: "ABIERTA" },
      include: {
        mesas: { include: { mesa: true } },
        pedidos: {
          include: { items: { include: { producto: true, modificadores: true } } },
          orderBy: { numeroSesion: "asc" },
        },
        eventos: { where: { atendido: false }, orderBy: { creadoEn: "desc" } },
      },
      orderBy: { abiertaEn: "asc" },
    });
    return { body: data };
  }),
);

mozoRouter.post(
  "/mozo/mesas/:id/unir",
  route(async (req) => {
    await requireRole(req, ["MOZO", "ADMIN"]);
    const { mesaIdsAdicionales } = unirSchema.parse(req.body);
    const sesion = await sesionService.unirMesas(DEMO_LOCAL_ID, [
      req.params.id,
      ...mesaIdsAdicionales,
    ]);
    return { status: 201, body: sesion };
  }),
);

mozoRouter.post(
  "/mozo/mesas/:id/separar",
  route(async (req) => {
    await requireRole(req, ["MOZO", "ADMIN"]);
    const id = req.params.id;
    const mesa = await prisma.mesa.findUnique({
      where: { id },
      include: { sesiones: { include: { sesion: true } } },
    });
    if (!mesa) throw new AppError(ErrorCode.NOT_FOUND, "Mesa no existe");
    if (mesa.estado !== "UNIDA") {
      throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, "Mesa no está unida");
    }
    const sesionActiva = mesa.sesiones.find((sm) => sm.sesion.estado === "ABIERTA");
    if (!sesionActiva) throw new AppError(ErrorCode.NOT_FOUND, "Sin sesión activa para separar");
    if (mesa.sesiones.length <= 1) {
      throw new AppError(ErrorCode.VALIDATION, "Mesa no tiene compañera para separar");
    }
    const pedidos = await prisma.pedido.count({ where: { sesionId: sesionActiva.sesion.id } });
    if (pedidos > 0) {
      throw new AppError(
        ErrorCode.INVALID_STATE_TRANSITION,
        "Mesas con pedidos no pueden separarse; cerrar primero",
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.sesionMesaMesas.delete({
        where: { sesionId_mesaId: { sesionId: sesionActiva.sesion.id, mesaId: id } },
      });
      await tx.mesa.update({ where: { id }, data: { estado: "LIBRE" } });
      await tx.eventoSesion.create({
        data: { sesionId: sesionActiva.sesion.id, tipo: "MESA_SEPARADA", payloadJson: { mesaId: id } },
      });
    });
    return { body: { ok: true } };
  }),
);

mozoRouter.post(
  "/mozo/sesion/:id/pedido",
  route(async (req) => {
    const { userId } = await requireRole(req, ["MOZO", "ADMIN"]);
    const body = pedidoCreateSchema.parse(req.body);
    const pedido = await pedidoService.crear({
      sesionId: req.params.id,
      origen: "MOZO",
      creadoPor: userId,
      items: body.items,
    });
    return { status: 201, body: pedido };
  }),
);

mozoRouter.patch(
  "/mozo/pedido/:id/cancelar",
  route(async (req) => {
    const { userId } = await requireRole(req, ["MOZO", "ADMIN"]);
    const { motivo } = cancelarSchema.parse(req.body);
    const p = await pedidoService.transicionar(req.params.id, "CANCELADO", { motivo, actor: userId });
    return { body: p };
  }),
);

mozoRouter.patch(
  "/mozo/pedido/:id/entregado",
  route(async (req) => {
    await requireRole(req, ["MOZO", "ADMIN"]);
    const p = await pedidoService.transicionar(req.params.id, "ENTREGADO");
    return { body: p };
  }),
);

mozoRouter.post(
  "/mozo/evento/:id/atender",
  route(async (req) => {
    const { userId } = await requireRole(req, ["MOZO", "CAJERO", "ADMIN"]);
    const ev = await eventosService.atender(req.params.id, userId);
    return { body: ev };
  }),
);
