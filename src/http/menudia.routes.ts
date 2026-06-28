import { Router } from "express";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import {
  comboCreateSchema,
  comboUpdateSchema,
  precioDiaUpsertSchema,
} from "@/lib/schemas/menudia";
import { AppError, ErrorCode } from "@/lib/errors";
import { route } from "./handler";

const LOCAL_ID = "demo-local";

function fechaUTC(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}
function hoyYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const menudiaRouter = Router();

/* ---------- Precios del día ---------- */
menudiaRouter.get(
  "/admin/menu-dia",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const fecha = (req.query.fecha as string) ?? hoyYmd();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new AppError(ErrorCode.VALIDATION, "fecha inválida");
    const fechaD = fechaUTC(fecha);
    const [productos, precios] = await Promise.all([
      prisma.producto.findMany({
        where: { deletedAt: null },
        orderBy: { orden: "asc" },
        include: { categoria: true },
      }),
      prisma.precioDia.findMany({ where: { localId: LOCAL_ID, fecha: fechaD } }),
    ]);
    const byProd = new Map(precios.map((p) => [p.productoId, p]));
    return {
      body: {
        fecha,
        productos: productos.map((p) => ({
          productoId: p.id,
          nombre: p.nombre,
          categoria: p.categoria.nombre,
          precioBase: p.precioBase.toString(),
          precioEspecial: byProd.get(p.id)?.precio.toString() ?? null,
          precioDiaId: byProd.get(p.id)?.id ?? null,
        })),
      },
    };
  }),
);

menudiaRouter.put(
  "/admin/menu-dia",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = precioDiaUpsertSchema.parse(req.body);
    const prod = await prisma.producto.findFirst({ where: { id: body.productoId, deletedAt: null } });
    if (!prod) throw new AppError(ErrorCode.NOT_FOUND, "Producto no existe");
    const r = await prisma.precioDia.upsert({
      where: { productoId_fecha: { productoId: body.productoId, fecha: fechaUTC(body.fecha) } },
      update: { precio: body.precio },
      create: {
        localId: LOCAL_ID,
        productoId: body.productoId,
        fecha: fechaUTC(body.fecha),
        precio: body.precio,
      },
    });
    return { body: r };
  }),
);

menudiaRouter.delete(
  "/admin/menu-dia/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const r = await prisma.precioDia.findFirst({ where: { id: req.params.id, localId: LOCAL_ID } });
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, "Precio del día no existe");
    await prisma.precioDia.delete({ where: { id: req.params.id } });
    return { body: { ok: true } };
  }),
);

/* ---------- Combos ---------- */
menudiaRouter.get(
  "/admin/combos",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const combos = await prisma.combo.findMany({
      where: { localId: LOCAL_ID, deletedAt: null },
      orderBy: { orden: "asc" },
      include: { items: { include: { producto: true } } },
    });
    return {
      body: combos.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        descripcion: c.descripcion,
        precio: c.precio.toString(),
        disponible: c.disponible,
        estacionId: c.estacionId,
        items: c.items.map((i) => ({
          productoId: i.productoId,
          nombre: i.producto.nombre,
          cantidad: i.cantidad,
        })),
      })),
    };
  }),
);

menudiaRouter.post(
  "/admin/combos",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = comboCreateSchema.parse(req.body);
    const estacionId =
      body.estacionId ??
      (await prisma.estacion.findFirstOrThrow({ where: { localId: LOCAL_ID, activa: true } })).id;
    const ids = [...new Set(body.items.map((i) => i.productoId))];
    const prods = await prisma.producto.findMany({ where: { id: { in: ids }, deletedAt: null } });
    if (prods.length !== ids.length) throw new AppError(ErrorCode.VALIDATION, "Algún producto no existe");
    const combo = await prisma.combo.create({
      data: {
        localId: LOCAL_ID,
        estacionId,
        nombre: body.nombre,
        descripcion: body.descripcion,
        precio: body.precio,
        items: { create: body.items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })) },
      },
      include: { items: { include: { producto: true } } },
    });
    return { status: 201, body: combo };
  }),
);

menudiaRouter.patch(
  "/admin/combos/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = comboUpdateSchema.parse(req.body);
    const c = await prisma.combo.findFirst({
      where: { id: req.params.id, localId: LOCAL_ID, deletedAt: null },
    });
    if (!c) throw new AppError(ErrorCode.NOT_FOUND, "Combo no existe");
    const updated = await prisma.$transaction(async (tx) => {
      const data: Prisma.ComboUpdateInput = {};
      if (body.nombre !== undefined) data.nombre = body.nombre;
      if (body.descripcion !== undefined) data.descripcion = body.descripcion;
      if (body.precio !== undefined) data.precio = body.precio;
      if (body.disponible !== undefined) data.disponible = body.disponible;
      if (body.estacionId !== undefined) data.estacion = { connect: { id: body.estacionId } };
      await tx.combo.update({ where: { id: c.id }, data });
      if (body.items) {
        await tx.comboItem.deleteMany({ where: { comboId: c.id } });
        for (const i of body.items) {
          await tx.comboItem.create({ data: { comboId: c.id, productoId: i.productoId, cantidad: i.cantidad } });
        }
      }
      return tx.combo.findUniqueOrThrow({
        where: { id: c.id },
        include: { items: { include: { producto: true } } },
      });
    });
    return { body: updated };
  }),
);

menudiaRouter.delete(
  "/admin/combos/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const c = await prisma.combo.findFirst({
      where: { id: req.params.id, localId: LOCAL_ID, deletedAt: null },
    });
    if (!c) throw new AppError(ErrorCode.NOT_FOUND, "Combo no existe");
    await prisma.combo.update({ where: { id: c.id }, data: { deletedAt: new Date(), disponible: false } });
    return { body: { ok: true } };
  }),
);
