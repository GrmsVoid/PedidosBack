import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError, ErrorCode } from "@/lib/errors";
import { dinero, multiplicar, sumar, toDbString } from "@/lib/dinero";
import { grupoService } from "@/modules/grupo/service";
import { itemInputSchema } from "@/lib/schemas/pedido";
import { normalizarPlano } from "@/lib/schemas/plano";
import { logger } from "@/lib/logger";
import { route } from "./handler";

const DEMO_LOCAL_ID = "demo-local";

// Límites anti-abuso: cualquiera en internet puede llamar estos endpoints.
const MAX_PENDIENTES_GLOBAL = 25;
const MAX_PENDIENTES_POR_MESA = 3;

const prePedidoSchema = z.object({
  mesaId: z.string().min(1).max(60),
  nombre: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((s) => s.replace(/\s+/g, " ")),
  telefono: z.string().trim().max(20).optional(),
  items: z.array(itemInputSchema).min(1).max(15),
});

/** Código corto para que el cliente se identifique con el mozo (sin confusables). */
function codigoCorto(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += abc[randomInt(abc.length)];
  return out;
}

export const publicoRouter = Router();

// El plano ya es visible en el local; exponerlo solo revela la distribución de mesas.
publicoRouter.get(
  "/publico/salon",
  route(async () => {
    const local = await prisma.local.findUniqueOrThrow({
      where: { id: DEMO_LOCAL_ID },
      select: { planoJson: true, nombre: true },
    });
    const mesas = await prisma.mesa.findMany({
      where: { localId: DEMO_LOCAL_ID, deletedAt: null },
      select: { id: true, codigo: true, capacidad: true, estado: true, posicionX: true, posicionY: true, pisoId: true },
      orderBy: { codigo: "asc" },
    });
    return { body: { nombre: local.nombre, plano: normalizarPlano(local.planoJson), mesas } };
  }),
);

// Crear pre-pedido: muy limitado por IP (3 cada 15 min) además de los topes en BD.
publicoRouter.post(
  "/publico/pre-pedido",
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 3,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      error: { code: "RATE_LIMITED", message: "Demasiados pedidos desde esta conexión. Intenta más tarde." },
    },
  }),
  route(async (req) => {
    const body = prePedidoSchema.parse(req.body);

    const mesa = await prisma.mesa.findFirst({
      where: { id: body.mesaId, localId: DEMO_LOCAL_ID, deletedAt: null },
    });
    if (!mesa) throw new AppError(ErrorCode.NOT_FOUND, "Mesa no existe");

    const [pendientesGlobal, pendientesMesa] = await Promise.all([
      prisma.pedidoRemoto.count({ where: { localId: DEMO_LOCAL_ID, estado: "PENDIENTE" } }),
      prisma.pedidoRemoto.count({ where: { mesaId: mesa.id, estado: "PENDIENTE" } }),
    ]);
    if (pendientesGlobal >= MAX_PENDIENTES_GLOBAL || pendientesMesa >= MAX_PENDIENTES_POR_MESA) {
      throw new AppError(
        ErrorCode.THROTTLED,
        "Hay muchos pedidos web en espera. Llama al local para coordinar tu visita.",
      );
    }

    // Snapshot con nombres y precios actuales (solo para mostrar; al aceptar se
    // revalida y congela todo con pedidoService.crear).
    const snapshot = [];
    let total = dinero("0");
    for (const it of body.items) {
      const calc = await grupoService._precioItem({
        id: "",
        participanteId: "",
        productoId: it.productoId ?? null,
        comboId: it.comboId ?? null,
        cantidad: it.cantidad,
        opcionesIds: it.opcionesIds,
        notaLibre: it.notaLibre,
      });
      const subtotal = multiplicar(dinero(calc.precioUnitario), it.cantidad);
      total = sumar(total, subtotal);
      snapshot.push({
        productoId: it.productoId ?? null,
        comboId: it.comboId ?? null,
        cantidad: it.cantidad,
        opcionesIds: it.opcionesIds,
        notaLibre: it.notaLibre,
        nombre: calc.nombre,
        opcionesLabel: calc.opcionesLabel,
        precioUnitario: calc.precioUnitario,
        subtotal: toDbString(subtotal),
      });
    }

    // Código único (reintenta ante colisión, improbable con 33^5)
    let creado = null;
    for (let intento = 0; intento < 5 && !creado; intento++) {
      try {
        creado = await prisma.pedidoRemoto.create({
          data: {
            localId: DEMO_LOCAL_ID,
            mesaId: mesa.id,
            codigo: codigoCorto(),
            nombreCliente: body.nombre,
            telefono: body.telefono ?? null,
            itemsJson: snapshot,
            total: toDbString(total),
          },
        });
      } catch {
        /* colisión de código único: reintenta */
      }
    }
    if (!creado) throw new AppError(ErrorCode.INTERNAL, "No se pudo registrar el pedido");

    logger.info("Pre-pedido web creado", { codigo: creado.codigo, mesa: mesa.codigo, ip: req.ip });
    try {
      const { emit } = await import("@/realtime/emitter");
      emit("mozos", "prepedido:nuevo", {
        prePedidoId: creado.id,
        codigo: creado.codigo,
        mesa: mesa.codigo,
        nombre: creado.nombreCliente,
      });
    } catch {
      /* best-effort */
    }
    return {
      status: 201,
      body: {
        codigo: creado.codigo,
        estado: creado.estado,
        mesaCodigo: mesa.codigo,
        total: toDbString(total),
      },
    };
  }),
);

// Estado del pre-pedido por código (para la pantalla de espera del cliente).
publicoRouter.get(
  "/publico/pre-pedido/:codigo",
  route(async (req) => {
    const codigo = String(req.params.codigo || "").toUpperCase().slice(0, 10);
    const p = await prisma.pedidoRemoto.findUnique({
      where: { codigo },
      include: { mesa: { select: { codigo: true } } },
    });
    if (!p || p.localId !== DEMO_LOCAL_ID) {
      throw new AppError(ErrorCode.NOT_FOUND, "Código no encontrado");
    }
    return {
      body: {
        codigo: p.codigo,
        estado: p.estado,
        mesaCodigo: p.mesa.codigo,
        nombre: p.nombreCliente,
        items: p.itemsJson,
        total: p.total.toString(),
        creadoEn: p.creadoEn,
      },
    };
  }),
);
