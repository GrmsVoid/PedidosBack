import { Router } from "express";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { parseRango } from "@/lib/query-parser";
import { finanzasService } from "@/modules/finanzas/service";
import {
  categoriaFinanzaCreateSchema,
  egresoCreateSchema,
  egresoUpdateSchema,
  ingresoCreateSchema,
  ingresoUpdateSchema,
  presupuestoUpsertSchema,
} from "@/lib/schemas/finanzas";
import { AppError, ErrorCode } from "@/lib/errors";
import { route } from "./handler";

const LOCAL_ID = "demo-local";

function fullUrl(req: { originalUrl: string }): string {
  return `http://localhost${req.originalUrl}`;
}

export const finanzasRouter = Router();

/* ---------- Dashboard ---------- */
finanzasRouter.get(
  "/admin/finanzas/resumen",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { desde, hasta } = parseRango(fullUrl(req));
    return { body: await finanzasService.resumen(desde, hasta) };
  }),
);

finanzasRouter.get(
  "/admin/finanzas/cancelados",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { desde, hasta } = parseRango(fullUrl(req));
    return { body: await finanzasService.cancelados(desde, hasta) };
  }),
);

/* ---------- Categorías de gasto ---------- */
finanzasRouter.get(
  "/admin/finanzas/categorias-gasto",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    return {
      body: await prisma.categoriaGasto.findMany({
        where: { localId: LOCAL_ID, deletedAt: null },
        orderBy: { orden: "asc" },
      }),
    };
  }),
);

finanzasRouter.post(
  "/admin/finanzas/categorias-gasto",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = categoriaFinanzaCreateSchema.parse(req.body);
    const c = await prisma.categoriaGasto.create({
      data: { localId: LOCAL_ID, nombre: body.nombre, orden: body.orden ?? 0 },
    });
    return { status: 201, body: c };
  }),
);

finanzasRouter.delete(
  "/admin/finanzas/categorias-gasto/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const c = await prisma.categoriaGasto.findUnique({ where: { id: req.params.id } });
    if (!c || c.deletedAt) throw new AppError(ErrorCode.NOT_FOUND, "Categoría no existe");
    await prisma.categoriaGasto.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), activa: false },
    });
    return { body: { ok: true } };
  }),
);

/* ---------- Egresos ---------- */
finanzasRouter.get(
  "/admin/finanzas/egresos",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { desde, hasta } = parseRango(fullUrl(req));
    return {
      body: await prisma.egreso.findMany({
        where: { localId: LOCAL_ID, fecha: { gte: desde, lte: hasta } },
        include: { categoria: true },
        orderBy: { fecha: "desc" },
      }),
    };
  }),
);

finanzasRouter.post(
  "/admin/finanzas/egresos",
  route(async (req) => {
    const { userId } = await requireRole(req, ["ADMIN"]);
    const body = egresoCreateSchema.parse(req.body);
    const cat = await prisma.categoriaGasto.findFirst({
      where: { id: body.categoriaId, localId: LOCAL_ID, deletedAt: null },
    });
    if (!cat) throw new AppError(ErrorCode.NOT_FOUND, "Categoría de gasto no existe");
    const e = await prisma.egreso.create({
      data: {
        localId: LOCAL_ID,
        categoriaId: body.categoriaId,
        monto: body.monto,
        fecha: new Date(body.fecha),
        descripcion: body.descripcion,
        origen: "MANUAL",
        creadoPor: userId,
      },
      include: { categoria: true },
    });
    return { status: 201, body: e };
  }),
);

finanzasRouter.patch(
  "/admin/finanzas/egresos/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = egresoUpdateSchema.parse(req.body);
    const e = await prisma.egreso.findFirst({ where: { id: req.params.id, localId: LOCAL_ID } });
    if (!e) throw new AppError(ErrorCode.NOT_FOUND, "Egreso no existe");
    if (e.origen === "PLANILLA") {
      throw new AppError(ErrorCode.VALIDATION, "Los egresos de planilla no se editan aquí");
    }
    const data: Prisma.EgresoUpdateInput = {};
    if (body.monto) data.monto = body.monto;
    if (body.fecha) data.fecha = new Date(body.fecha);
    if (body.descripcion !== undefined) data.descripcion = body.descripcion;
    if (body.categoriaId) data.categoria = { connect: { id: body.categoriaId } };
    return {
      body: await prisma.egreso.update({
        where: { id: req.params.id },
        data,
        include: { categoria: true },
      }),
    };
  }),
);

finanzasRouter.delete(
  "/admin/finanzas/egresos/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const e = await prisma.egreso.findFirst({ where: { id: req.params.id, localId: LOCAL_ID } });
    if (!e) throw new AppError(ErrorCode.NOT_FOUND, "Egreso no existe");
    if (e.origen === "PLANILLA") {
      throw new AppError(ErrorCode.VALIDATION, "Los egresos de planilla se anulan desde Planilla");
    }
    await prisma.egreso.delete({ where: { id: req.params.id } });
    return { body: { ok: true } };
  }),
);

/* ---------- Categorías de ingreso ---------- */
finanzasRouter.get(
  "/admin/finanzas/categorias-ingreso",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    return {
      body: await prisma.categoriaIngreso.findMany({
        where: { localId: LOCAL_ID, deletedAt: null },
        orderBy: { orden: "asc" },
      }),
    };
  }),
);

finanzasRouter.post(
  "/admin/finanzas/categorias-ingreso",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = categoriaFinanzaCreateSchema.parse(req.body);
    const c = await prisma.categoriaIngreso.create({
      data: { localId: LOCAL_ID, nombre: body.nombre, orden: body.orden ?? 0 },
    });
    return { status: 201, body: c };
  }),
);

finanzasRouter.delete(
  "/admin/finanzas/categorias-ingreso/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const c = await prisma.categoriaIngreso.findUnique({ where: { id: req.params.id } });
    if (!c || c.deletedAt) throw new AppError(ErrorCode.NOT_FOUND, "Categoría no existe");
    await prisma.categoriaIngreso.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), activa: false },
    });
    return { body: { ok: true } };
  }),
);

/* ---------- Ingresos extra ---------- */
finanzasRouter.get(
  "/admin/finanzas/ingresos",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { desde, hasta } = parseRango(fullUrl(req));
    return {
      body: await prisma.ingresoExtra.findMany({
        where: { localId: LOCAL_ID, fecha: { gte: desde, lte: hasta } },
        include: { categoria: true },
        orderBy: { fecha: "desc" },
      }),
    };
  }),
);

finanzasRouter.post(
  "/admin/finanzas/ingresos",
  route(async (req) => {
    const { userId } = await requireRole(req, ["ADMIN"]);
    const body = ingresoCreateSchema.parse(req.body);
    const cat = await prisma.categoriaIngreso.findFirst({
      where: { id: body.categoriaId, localId: LOCAL_ID, deletedAt: null },
    });
    if (!cat) throw new AppError(ErrorCode.NOT_FOUND, "Categoría de ingreso no existe");
    const i = await prisma.ingresoExtra.create({
      data: {
        localId: LOCAL_ID,
        categoriaId: body.categoriaId,
        monto: body.monto,
        fecha: new Date(body.fecha),
        descripcion: body.descripcion,
        creadoPor: userId,
      },
      include: { categoria: true },
    });
    return { status: 201, body: i };
  }),
);

finanzasRouter.patch(
  "/admin/finanzas/ingresos/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = ingresoUpdateSchema.parse(req.body);
    const i = await prisma.ingresoExtra.findFirst({ where: { id: req.params.id, localId: LOCAL_ID } });
    if (!i) throw new AppError(ErrorCode.NOT_FOUND, "Ingreso no existe");
    const data: Prisma.IngresoExtraUpdateInput = {};
    if (body.monto) data.monto = body.monto;
    if (body.fecha) data.fecha = new Date(body.fecha);
    if (body.descripcion !== undefined) data.descripcion = body.descripcion;
    if (body.categoriaId) data.categoria = { connect: { id: body.categoriaId } };
    return {
      body: await prisma.ingresoExtra.update({
        where: { id: req.params.id },
        data,
        include: { categoria: true },
      }),
    };
  }),
);

finanzasRouter.delete(
  "/admin/finanzas/ingresos/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const i = await prisma.ingresoExtra.findFirst({ where: { id: req.params.id, localId: LOCAL_ID } });
    if (!i) throw new AppError(ErrorCode.NOT_FOUND, "Ingreso no existe");
    await prisma.ingresoExtra.delete({ where: { id: req.params.id } });
    return { body: { ok: true } };
  }),
);

/* ---------- Presupuestos (Fase B) ---------- */
finanzasRouter.get(
  "/admin/finanzas/presupuestos",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const now = new Date();
    const anio = Number(req.query.anio ?? now.getFullYear());
    const mes = Number(req.query.mes ?? now.getMonth() + 1);
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new AppError(ErrorCode.VALIDATION, "anio/mes inválidos");
    }
    return { body: await finanzasService.presupuestos(anio, mes) };
  }),
);

finanzasRouter.put(
  "/admin/finanzas/presupuestos",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = presupuestoUpsertSchema.parse(req.body);
    const cat = await prisma.categoriaGasto.findFirst({
      where: { id: body.categoriaId, localId: LOCAL_ID, deletedAt: null },
    });
    if (!cat) throw new AppError(ErrorCode.NOT_FOUND, "Categoría de gasto no existe");
    const p = await prisma.presupuesto.upsert({
      where: {
        localId_categoriaId_anio_mes: {
          localId: LOCAL_ID,
          categoriaId: body.categoriaId,
          anio: body.anio,
          mes: body.mes,
        },
      },
      update: { montoLimite: body.montoLimite },
      create: {
        localId: LOCAL_ID,
        categoriaId: body.categoriaId,
        anio: body.anio,
        mes: body.mes,
        montoLimite: body.montoLimite,
      },
    });
    return { body: p };
  }),
);

finanzasRouter.delete(
  "/admin/finanzas/presupuestos/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const p = await prisma.presupuesto.findFirst({ where: { id: req.params.id, localId: LOCAL_ID } });
    if (!p) throw new AppError(ErrorCode.NOT_FOUND, "Presupuesto no existe");
    await prisma.presupuesto.delete({ where: { id: req.params.id } });
    return { body: { ok: true } };
  }),
);
