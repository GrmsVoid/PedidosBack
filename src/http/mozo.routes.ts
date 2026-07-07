import { Router } from "express";
import { z } from "zod";
import { requireRole } from "@/lib/authorize";
import { mesaRepo } from "@/modules/mesa/repository";
import { grupoService } from "@/modules/grupo/service";
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
    await requireRole(req, ["MOZO", "CAJERO"]);
    return { body: await mesaRepo.listarPorLocal(DEMO_LOCAL_ID) };
  }),
);

mozoRouter.get(
  "/mozo/sesiones",
  route(async (req) => {
    await requireRole(req, ["MOZO"]);
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
  "/mozo/mesas/:id/abrir",
  route(async (req) => {
    await requireRole(req, ["MOZO"]);
    const r = await grupoService.abrirPorMozo(DEMO_LOCAL_ID, req.params.id);
    return { status: r.yaExistia ? 200 : 201, body: r };
  }),
);

mozoRouter.post(
  "/mozo/mesas/:id/unir",
  route(async (req) => {
    await requireRole(req, ["MOZO"]);
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
    await requireRole(req, ["MOZO"]);
    return { body: await sesionService.separarMesa(DEMO_LOCAL_ID, req.params.id) };
  }),
);

mozoRouter.post(
  "/mozo/sesion/:id/pedido",
  route(async (req) => {
    const { userId } = await requireRole(req, ["MOZO"]);
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
    const { userId } = await requireRole(req, ["MOZO"]);
    const { motivo } = cancelarSchema.parse(req.body);
    const p = await pedidoService.transicionar(req.params.id, "CANCELADO", { motivo, actor: userId });
    return { body: p };
  }),
);

mozoRouter.patch(
  "/mozo/pedido/:id/entregado",
  route(async (req) => {
    await requireRole(req, ["MOZO"]);
    const p = await pedidoService.transicionar(req.params.id, "ENTREGADO");
    return { body: p };
  }),
);

/* ---------- Pedidos web (pre-pedidos): pasan a cocina solo si el mozo acepta ---------- */

mozoRouter.get(
  "/mozo/pre-pedidos",
  route(async (req) => {
    await requireRole(req, ["MOZO"]);
    const lista = await prisma.pedidoRemoto.findMany({
      where: { localId: DEMO_LOCAL_ID, estado: "PENDIENTE" },
      include: { mesa: { select: { codigo: true, estado: true } } },
      orderBy: { creadoEn: "asc" },
    });
    return { body: lista };
  }),
);

mozoRouter.post(
  "/mozo/pre-pedido/:id/aceptar",
  route(async (req) => {
    const { userId } = await requireRole(req, ["MOZO"]);
    const remoto = await prisma.pedidoRemoto.findUnique({ where: { id: req.params.id } });
    if (!remoto || remoto.estado !== "PENDIENTE") {
      throw new AppError(ErrorCode.NOT_FOUND, "El pedido web ya no está pendiente");
    }
    // Abre (o reusa) la sesión de la mesa elegida y confirma el pedido a cocina
    // revalidando disponibilidad y congelando precios actuales.
    const { sesionId } = await grupoService.abrirPorMozo(DEMO_LOCAL_ID, remoto.mesaId);
    const items = (remoto.itemsJson as Array<{
      productoId: string | null;
      comboId: string | null;
      cantidad: number;
      opcionesIds: string[];
      notaLibre: string | null;
    }>).map((it) => ({
      productoId: it.productoId ?? undefined,
      comboId: it.comboId ?? undefined,
      cantidad: it.cantidad,
      opcionesIds: it.opcionesIds ?? [],
      notaLibre: it.notaLibre,
    }));
    const pedido = await pedidoService.crear({
      sesionId,
      origen: "MOZO",
      creadoPor: userId,
      items,
    });
    const upd = await prisma.pedidoRemoto.update({
      where: { id: remoto.id },
      data: { estado: "ACEPTADO", sesionId, resueltoPor: userId, resueltoEn: new Date() },
    });
    try {
      const { emit } = await import("@/realtime/emitter");
      emit("mozos", "prepedido:resuelto", { prePedidoId: upd.id, estado: upd.estado });
    } catch {
      /* best-effort */
    }
    return { body: { prePedido: upd, pedidoId: pedido.id } };
  }),
);

mozoRouter.post(
  "/mozo/pre-pedido/:id/rechazar",
  route(async (req) => {
    const { userId } = await requireRole(req, ["MOZO"]);
    const remoto = await prisma.pedidoRemoto.findUnique({ where: { id: req.params.id } });
    if (!remoto || remoto.estado !== "PENDIENTE") {
      throw new AppError(ErrorCode.NOT_FOUND, "El pedido web ya no está pendiente");
    }
    const upd = await prisma.pedidoRemoto.update({
      where: { id: remoto.id },
      data: { estado: "RECHAZADO", resueltoPor: userId, resueltoEn: new Date() },
    });
    try {
      const { emit } = await import("@/realtime/emitter");
      emit("mozos", "prepedido:resuelto", { prePedidoId: upd.id, estado: upd.estado });
    } catch {
      /* best-effort */
    }
    return { body: upd };
  }),
);

mozoRouter.post(
  "/mozo/evento/:id/atender",
  route(async (req) => {
    const { userId } = await requireRole(req, ["MOZO", "CAJERO"]);
    const ev = await eventosService.atender(req.params.id, userId);
    return { body: ev };
  }),
);
