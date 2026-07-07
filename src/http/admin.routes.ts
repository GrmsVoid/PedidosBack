import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { firmarTokenMesa } from "@/lib/qr";
import { categoriaCreateSchema, categoriaUpdateSchema } from "@/lib/schemas/categoria";
import { productoCreateSchema, productoUpdateSchema, grupoSchema } from "@/lib/schemas/producto";
import { mesaCreateSchema, mesaUpdateSchema } from "@/lib/schemas/mesa";
import { normalizarPlano, planoSchema, posicionesSchema } from "@/lib/schemas/plano";
import { reportesService } from "@/modules/reportes/service";
import { parseRango } from "@/lib/query-parser";
import { AppError, ErrorCode } from "@/lib/errors";
import { route } from "./handler";

const DEMO_LOCAL_ID = "demo-local";
const modificadoresSchema = z.object({ grupos: z.array(grupoSchema) });

function fullUrl(req: { originalUrl: string }): string {
  return `http://localhost${req.originalUrl}`;
}

export const adminRouter = Router();

/* ---------- Categorías ---------- */
adminRouter.get(
  "/admin/categorias",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    return {
      body: await prisma.categoria.findMany({
        where: { localId: DEMO_LOCAL_ID, deletedAt: null },
        orderBy: { orden: "asc" },
      }),
    };
  }),
);

adminRouter.post(
  "/admin/categorias",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = categoriaCreateSchema.parse(req.body);
    const cat = await prisma.categoria.create({ data: { ...body, localId: DEMO_LOCAL_ID } });
    return { status: 201, body: cat };
  }),
);

adminRouter.patch(
  "/admin/categorias/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = categoriaUpdateSchema.parse(req.body);
    const cat = await prisma.categoria.findUnique({ where: { id: req.params.id } });
    if (!cat || cat.deletedAt) throw new AppError(ErrorCode.NOT_FOUND, "Categoría no existe");
    return { body: await prisma.categoria.update({ where: { id: req.params.id }, data: body }) };
  }),
);

adminRouter.delete(
  "/admin/categorias/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const cat = await prisma.categoria.findUnique({ where: { id: req.params.id } });
    if (!cat || cat.deletedAt) throw new AppError(ErrorCode.NOT_FOUND, "Categoría no existe");
    await prisma.categoria.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), activa: false },
    });
    return { body: { ok: true } };
  }),
);

/* ---------- Productos ---------- */
adminRouter.get(
  "/admin/productos",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    return {
      body: await prisma.producto.findMany({
        where: { deletedAt: null },
        include: { grupos: { include: { opciones: true } } },
        orderBy: { orden: "asc" },
      }),
    };
  }),
);

adminRouter.post(
  "/admin/productos",
  route(async (req) => {
    const { userId } = await requireRole(req, ["ADMIN"]);
    const body = productoCreateSchema.parse(req.body);
    const producto = await prisma.$transaction(async (tx) => {
      const p = await tx.producto.create({
        data: {
          categoriaId: body.categoriaId,
          estacionId: body.estacionId,
          nombre: body.nombre,
          descripcion: body.descripcion,
          imagenUrl: body.imagenUrl,
          precioBase: body.precioBase,
          prepTimeMinutes: body.prepTimeMinutes,
          disponible: body.disponible,
          orden: body.orden,
        },
      });
      for (const g of body.grupos) {
        await tx.grupoModificador.create({
          data: {
            productoId: p.id,
            nombre: g.nombre,
            obligatorio: g.obligatorio,
            minSeleccion: g.minSeleccion,
            maxSeleccion: g.maxSeleccion,
            orden: g.orden,
            opciones: { create: g.opciones },
          },
        });
      }
      await tx.productoPrecioHist.create({
        data: {
          productoId: p.id,
          precioAnterior: "0.00",
          precioNuevo: body.precioBase,
          cambiadoPor: userId,
        },
      });
      return tx.producto.findUniqueOrThrow({
        where: { id: p.id },
        include: { grupos: { include: { opciones: true } } },
      });
    });
    return { status: 201, body: producto };
  }),
);

adminRouter.patch(
  "/admin/productos/:id",
  route(async (req) => {
    const { userId } = await requireRole(req, ["ADMIN"]);
    const body = productoUpdateSchema.parse(req.body);
    const actual = await prisma.producto.findUnique({ where: { id: req.params.id } });
    if (!actual || actual.deletedAt) throw new AppError(ErrorCode.NOT_FOUND, "Producto no existe");
    const upd = await prisma.$transaction(async (tx) => {
      const u = await tx.producto.update({ where: { id: req.params.id }, data: body });
      if (body.precioBase && body.precioBase !== actual.precioBase.toString()) {
        await tx.productoPrecioHist.create({
          data: {
            productoId: u.id,
            precioAnterior: actual.precioBase.toString(),
            precioNuevo: body.precioBase,
            cambiadoPor: userId,
          },
        });
      }
      return u;
    });
    return { body: upd };
  }),
);

adminRouter.delete(
  "/admin/productos/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    await prisma.producto.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), disponible: false },
    });
    return { body: { ok: true } };
  }),
);

adminRouter.put(
  "/admin/productos/:id/modificadores",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = modificadoresSchema.parse(req.body);
    const producto = await prisma.$transaction(async (tx) => {
      const grupos = await tx.grupoModificador.findMany({
        where: { productoId: req.params.id },
        select: { id: true },
      });
      const grupoIds = grupos.map((g) => g.id);
      await tx.opcionModificador.deleteMany({ where: { grupoId: { in: grupoIds } } });
      await tx.grupoModificador.deleteMany({ where: { productoId: req.params.id } });
      for (const g of body.grupos) {
        await tx.grupoModificador.create({
          data: {
            productoId: req.params.id,
            nombre: g.nombre,
            obligatorio: g.obligatorio,
            minSeleccion: g.minSeleccion,
            maxSeleccion: g.maxSeleccion,
            orden: g.orden,
            opciones: { create: g.opciones },
          },
        });
      }
      return tx.producto.findUniqueOrThrow({
        where: { id: req.params.id },
        include: { grupos: { include: { opciones: true } } },
      });
    });
    return { body: producto };
  }),
);

/* ---------- Plano del salón ---------- */
// Lectura compartida con el mozo: necesita el mapa para atender por ubicación física.
adminRouter.get(
  "/admin/plano",
  route(async (req) => {
    await requireRole(req, ["ADMIN", "MOZO"]);
    const local = await prisma.local.findUniqueOrThrow({
      where: { id: DEMO_LOCAL_ID },
      select: { planoJson: true },
    });
    const mesas = await prisma.mesa.findMany({
      where: { localId: DEMO_LOCAL_ID, deletedAt: null },
      select: { id: true, codigo: true, capacidad: true, estado: true, posicionX: true, posicionY: true, pisoId: true },
      orderBy: { codigo: "asc" },
    });
    return { body: { plano: normalizarPlano(local.planoJson), mesas } };
  }),
);

adminRouter.put(
  "/admin/plano",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const plano = planoSchema.parse(req.body);
    await prisma.local.update({
      where: { id: DEMO_LOCAL_ID },
      data: { planoJson: plano },
    });
    return { body: { plano } };
  }),
);

adminRouter.put(
  "/admin/plano/posiciones",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { posiciones } = posicionesSchema.parse(req.body);
    await prisma.$transaction(
      posiciones.map((p) =>
        prisma.mesa.update({
          where: { id: p.id },
          data: {
            posicionX: p.posicionX,
            posicionY: p.posicionY,
            ...(p.pisoId !== undefined ? { pisoId: p.pisoId } : {}),
          },
        }),
      ),
    );
    return { body: { ok: true, actualizadas: posiciones.length } };
  }),
);

/* ---------- Mesas ---------- */
adminRouter.get(
  "/admin/mesas",
  route(async (req) => {
    await requireRole(req, ["ADMIN", "MOZO"]);
    return {
      body: await prisma.mesa.findMany({
        where: { localId: DEMO_LOCAL_ID, deletedAt: null },
        orderBy: [{ posicionY: "asc" }, { posicionX: "asc" }],
      }),
    };
  }),
);

adminRouter.post(
  "/admin/mesas",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = mesaCreateSchema.parse(req.body);
    const local = await prisma.local.findUniqueOrThrow({ where: { id: DEMO_LOCAL_ID } });
    const tempId = randomUUID();
    const qrToken = await firmarTokenMesa({
      mesaId: tempId,
      localId: DEMO_LOCAL_ID,
      keyId: local.qrSigningKeyId,
    });
    const mesa = await prisma.mesa.create({
      data: { ...body, localId: DEMO_LOCAL_ID, id: tempId, qrToken },
    });
    return { status: 201, body: mesa };
  }),
);

adminRouter.patch(
  "/admin/mesas/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = mesaUpdateSchema.parse(req.body);
    const m = await prisma.mesa.findUnique({ where: { id: req.params.id } });
    if (!m || m.deletedAt) throw new AppError(ErrorCode.NOT_FOUND, "Mesa no existe");
    return { body: await prisma.mesa.update({ where: { id: req.params.id }, data: body }) };
  }),
);

adminRouter.delete(
  "/admin/mesas/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const m = await prisma.mesa.findUnique({ where: { id: req.params.id } });
    if (!m || m.deletedAt) throw new AppError(ErrorCode.NOT_FOUND, "Mesa no existe");
    if (m.estado !== "LIBRE") {
      throw new AppError(ErrorCode.TABLE_BUSY, "Mesa ocupada o unida; libérala antes de borrar");
    }
    await prisma.mesa.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    return { body: { ok: true } };
  }),
);

adminRouter.post(
  "/admin/mesas/:id/regenerar-qr",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const m = await prisma.mesa.findUnique({
      where: { id: req.params.id },
      include: { local: true },
    });
    if (!m || m.deletedAt) throw new AppError(ErrorCode.NOT_FOUND, "Mesa no existe");
    const qrToken = await firmarTokenMesa({
      mesaId: m.id,
      localId: m.localId,
      keyId: m.local.qrSigningKeyId,
    });
    await prisma.mesa.update({ where: { id: m.id }, data: { qrToken } });
    return { body: { ok: true, qrToken } };
  }),
);

adminRouter.post(
  "/admin/qr-signing-key/rotar",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const nuevoKid = `v${Date.now()}`;
    const local = await prisma.local.update({
      where: { id: DEMO_LOCAL_ID },
      data: { qrSigningKeyId: nuevoKid },
    });
    const mesas = await prisma.mesa.findMany({ where: { localId: local.id, deletedAt: null } });
    for (const m of mesas) {
      const tok = await firmarTokenMesa({ mesaId: m.id, localId: local.id, keyId: nuevoKid });
      await prisma.mesa.update({ where: { id: m.id }, data: { qrToken: tok } });
    }
    return { body: { ok: true, keyId: nuevoKid, mesasReimpresas: mesas.length } };
  }),
);

/* ---------- Reportes ---------- */
adminRouter.get(
  "/admin/reportes/ventas",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { desde, hasta } = parseRango(fullUrl(req));
    return { body: await reportesService.ventas(desde, hasta) };
  }),
);

adminRouter.get(
  "/admin/reportes/comprobantes",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { desde, hasta } = parseRango(fullUrl(req));
    return { body: await reportesService.comprobantes(desde, hasta) };
  }),
);

adminRouter.get(
  "/admin/reportes/top-productos",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { desde, hasta } = parseRango(fullUrl(req));
    const limit = Number((req.query.limit as string) ?? "10");
    return { body: await reportesService.topProductos(desde, hasta, limit) };
  }),
);

adminRouter.get(
  "/admin/reportes/horas-pico",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { desde, hasta } = parseRango(fullUrl(req));
    return { body: await reportesService.horasPico(desde, hasta) };
  }),
);

adminRouter.get(
  "/admin/reportes/satisfaccion",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { desde, hasta } = parseRango(fullUrl(req));
    return { body: await reportesService.satisfaccion(desde, hasta) };
  }),
);

adminRouter.get(
  "/admin/auditoria",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { desde, hasta } = parseRango(fullUrl(req));
    const tipo = (req.query.tipo as string) ?? null;
    return { body: await reportesService.auditoria(tipo, desde, hasta) };
  }),
);
