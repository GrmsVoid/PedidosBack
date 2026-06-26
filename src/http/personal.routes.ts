import { Router } from "express";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/authorize";
import { hashSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseRango } from "@/lib/query-parser";
import {
  turnoCreateSchema,
  turnoUpdateSchema,
  usuarioCreateSchema,
  usuarioUpdateSchema,
} from "@/lib/schemas/personal";
import { AppError, ErrorCode } from "@/lib/errors";
import { route } from "./handler";

function fullUrl(req: { originalUrl: string }): string {
  return `http://localhost${req.originalUrl}`;
}

type UsuarioConRoles = {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
  telefono: string | null;
  tipoRemuneracion: "FIJO_MENSUAL" | "POR_HORA" | "POR_TURNO";
  sueldoMensual: { toString(): string } | null;
  tarifaHora: { toString(): string } | null;
  montoTurno: { toString(): string } | null;
  roles: { rol: { codigo: string } }[];
};

function toUsuarioDto(u: UsuarioConRoles) {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    activo: u.activo,
    telefono: u.telefono,
    tipoRemuneracion: u.tipoRemuneracion,
    sueldoMensual: u.sueldoMensual?.toString() ?? null,
    tarifaHora: u.tarifaHora?.toString() ?? null,
    montoTurno: u.montoTurno?.toString() ?? null,
    roles: u.roles.map((ur) => ur.rol.codigo),
  };
}

/** Cuántos administradores activos hay además del usuario indicado. */
async function otrosAdminsActivos(excludeId: string): Promise<number> {
  return prisma.usuario.count({
    where: {
      id: { not: excludeId },
      activo: true,
      deletedAt: null,
      roles: { some: { rol: { codigo: "ADMIN" } } },
    },
  });
}

export const personalRouter = Router();

/* ---------- Usuarios ---------- */
personalRouter.get(
  "/admin/usuarios",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const users = await prisma.usuario.findMany({
      where: { deletedAt: null },
      include: { roles: { include: { rol: true } } },
      orderBy: { createdAt: "asc" },
    });
    return { body: users.map(toUsuarioDto) };
  }),
);

personalRouter.post(
  "/admin/usuarios",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = usuarioCreateSchema.parse(req.body);
    const existe = await prisma.usuario.findUnique({ where: { email: body.email } });
    if (existe) throw new AppError(ErrorCode.VALIDATION, "Ya existe un usuario con ese email");
    const roles = await prisma.rol.findMany({ where: { codigo: { in: body.roles } } });
    const passwordHash = await hashSecret(body.secret);
    const u = await prisma.usuario.create({
      data: {
        email: body.email,
        nombre: body.nombre,
        passwordHash,
        telefono: body.telefono,
        tipoRemuneracion: body.tipoRemuneracion,
        sueldoMensual: body.sueldoMensual,
        tarifaHora: body.tarifaHora,
        montoTurno: body.montoTurno,
        roles: { create: roles.map((r) => ({ rolId: r.id })) },
      },
      include: { roles: { include: { rol: true } } },
    });
    return { status: 201, body: toUsuarioDto(u) };
  }),
);

personalRouter.patch(
  "/admin/usuarios/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = usuarioUpdateSchema.parse(req.body);
    const u = await prisma.usuario.findUnique({
      where: { id: req.params.id },
      include: { roles: { include: { rol: true } } },
    });
    if (!u || u.deletedAt) throw new AppError(ErrorCode.NOT_FOUND, "Usuario no existe");

    // No dejar al local sin ningún administrador activo.
    const eraAdmin = u.roles.some((r) => r.rol.codigo === "ADMIN");
    const quedaAdmin = body.roles ? body.roles.includes("ADMIN") : eraAdmin;
    const quedaActivo = body.activo !== undefined ? body.activo : u.activo;
    if (eraAdmin && (!quedaAdmin || !quedaActivo) && (await otrosAdminsActivos(u.id)) === 0) {
      throw new AppError(ErrorCode.VALIDATION, "Debe quedar al menos un administrador activo");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: Prisma.UsuarioUpdateInput = {};
      if (body.nombre !== undefined) data.nombre = body.nombre;
      if (body.activo !== undefined) data.activo = body.activo;
      if (body.telefono !== undefined) data.telefono = body.telefono;
      if (body.tipoRemuneracion !== undefined) data.tipoRemuneracion = body.tipoRemuneracion;
      if (body.sueldoMensual !== undefined) data.sueldoMensual = body.sueldoMensual;
      if (body.tarifaHora !== undefined) data.tarifaHora = body.tarifaHora;
      if (body.montoTurno !== undefined) data.montoTurno = body.montoTurno;
      if (body.secret) data.passwordHash = await hashSecret(body.secret);
      await tx.usuario.update({ where: { id: u.id }, data });

      if (body.roles) {
        await tx.usuarioRol.deleteMany({ where: { usuarioId: u.id } });
        const roles = await tx.rol.findMany({ where: { codigo: { in: body.roles } } });
        for (const r of roles) {
          await tx.usuarioRol.create({ data: { usuarioId: u.id, rolId: r.id } });
        }
      }
      return tx.usuario.findUniqueOrThrow({
        where: { id: u.id },
        include: { roles: { include: { rol: true } } },
      });
    });
    return { body: toUsuarioDto(updated) };
  }),
);

personalRouter.delete(
  "/admin/usuarios/:id",
  route(async (req) => {
    const { userId } = await requireRole(req, ["ADMIN"]);
    if (req.params.id === userId) {
      throw new AppError(ErrorCode.VALIDATION, "No puedes eliminar tu propia cuenta");
    }
    const u = await prisma.usuario.findUnique({
      where: { id: req.params.id },
      include: { roles: { include: { rol: true } } },
    });
    if (!u || u.deletedAt) throw new AppError(ErrorCode.NOT_FOUND, "Usuario no existe");
    const esAdmin = u.roles.some((r) => r.rol.codigo === "ADMIN");
    if (esAdmin && (await otrosAdminsActivos(u.id)) === 0) {
      throw new AppError(ErrorCode.VALIDATION, "Debe quedar al menos un administrador activo");
    }
    await prisma.usuario.update({
      where: { id: u.id },
      data: { deletedAt: new Date(), activo: false },
    });
    return { body: { ok: true } };
  }),
);

/* ---------- Turnos ---------- */
personalRouter.get(
  "/admin/turnos",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { desde, hasta } = parseRango(fullUrl(req));
    const turnos = await prisma.turno.findMany({
      where: { fecha: { gte: desde, lte: hasta } },
      include: { usuario: { select: { id: true, nombre: true } } },
      orderBy: [{ fecha: "asc" }, { horaInicio: "asc" }],
    });
    return {
      body: turnos.map((t) => ({
        id: t.id,
        usuarioId: t.usuarioId,
        usuarioNombre: t.usuario.nombre,
        fecha: t.fecha,
        horaInicio: t.horaInicio,
        horaFin: t.horaFin,
        nota: t.nota,
      })),
    };
  }),
);

personalRouter.post(
  "/admin/turnos",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = turnoCreateSchema.parse(req.body);
    if (body.horaFin <= body.horaInicio) {
      throw new AppError(ErrorCode.VALIDATION, "La hora de fin debe ser mayor a la de inicio");
    }
    const u = await prisma.usuario.findFirst({ where: { id: body.usuarioId, deletedAt: null } });
    if (!u) throw new AppError(ErrorCode.NOT_FOUND, "Usuario no existe");
    const t = await prisma.turno.create({
      data: {
        usuarioId: body.usuarioId,
        fecha: new Date(body.fecha),
        horaInicio: body.horaInicio,
        horaFin: body.horaFin,
        nota: body.nota,
      },
    });
    return { status: 201, body: t };
  }),
);

personalRouter.patch(
  "/admin/turnos/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const body = turnoUpdateSchema.parse(req.body);
    const t = await prisma.turno.findUnique({ where: { id: req.params.id } });
    if (!t) throw new AppError(ErrorCode.NOT_FOUND, "Turno no existe");
    const hi = body.horaInicio ?? t.horaInicio;
    const hf = body.horaFin ?? t.horaFin;
    if (hf <= hi) {
      throw new AppError(ErrorCode.VALIDATION, "La hora de fin debe ser mayor a la de inicio");
    }
    const data: Prisma.TurnoUpdateInput = {};
    if (body.fecha) data.fecha = new Date(body.fecha);
    if (body.horaInicio) data.horaInicio = body.horaInicio;
    if (body.horaFin) data.horaFin = body.horaFin;
    if (body.nota !== undefined) data.nota = body.nota;
    return { body: await prisma.turno.update({ where: { id: t.id }, data }) };
  }),
);

personalRouter.delete(
  "/admin/turnos/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const t = await prisma.turno.findUnique({ where: { id: req.params.id } });
    if (!t) throw new AppError(ErrorCode.NOT_FOUND, "Turno no existe");
    await prisma.turno.delete({ where: { id: req.params.id } });
    return { body: { ok: true } };
  }),
);
