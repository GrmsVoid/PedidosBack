import { Router, type Request } from "express";
import { z } from "zod";
import { sesionService } from "@/modules/sesion/service";
import { sesionRepo } from "@/modules/sesion/repository";
import { eventosService } from "@/modules/eventos/service";
import { pedidoService } from "@/modules/pedido/service";
import { verificarTokenMesa } from "@/lib/qr";
import {
  firmarSessionToken,
  verificarSessionToken,
  type SessionTokenPayload,
} from "@/lib/session-token";
import { firmarParticipanteToken } from "@/lib/grupo-token";
import { grupoService } from "@/modules/grupo/service";
import { bearer } from "@/lib/authorize";
import { pedidoCreateSchema } from "@/lib/schemas/pedido";
import { encuestaSchema } from "@/lib/schemas/encuesta";
import { runIdempotent } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { AppError, ErrorCode } from "@/lib/errors";
import { route } from "./handler";

export const sesionRouter = Router();

const abrirSchema = z.object({ qrToken: z.string().min(10) });

async function requireOperativo(req: Request): Promise<SessionTokenPayload> {
  const tok = bearer(req);
  if (!tok) throw new AppError(ErrorCode.SESSION_EXPIRED, "Falta token");
  const payload = await verificarSessionToken(tok);
  if (payload.tipo !== "OPERATIVO") {
    throw new AppError(ErrorCode.SESSION_EXPIRED, "Token solo válido para encuesta");
  }
  return payload;
}

sesionRouter.post(
  "/sesion/mesa/:mesaId",
  route(async (req) => {
    const { qrToken } = abrirSchema.parse(req.body);
    const payload = await verificarTokenMesa(qrToken);
    if (payload.mesaId !== req.params.mesaId) {
      throw new AppError(ErrorCode.INVALID_QR_TOKEN, "Token no corresponde a la mesa");
    }
    const r = await grupoService.escanear(payload.localId, req.params.mesaId);
    // Mesa ya ocupada por otro grupo: el cliente debe confirmar que se suma.
    if (r.estado === "OCUPADA") {
      return {
        body: {
          estado: "OCUPADA",
          sesionId: r.sesionId,
          mesaCodigo: r.mesaCodigo,
          grupoActivos: r.grupoActivos,
          holdExpiraEn: r.holdExpiraEn,
        },
      };
    }
    // Mesa libre: se abre sesión y este comensal es el anfitrión.
    const cierreEstimadoIso = new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString();
    const sessionToken = await firmarSessionToken({
      sesionId: r.sesionId,
      mesaIds: r.mesaIds,
      cierreEstimadoIso,
    });
    const participanteToken = await firmarParticipanteToken({
      sesionId: r.sesionId,
      participanteId: r.participanteId,
    });
    return {
      body: {
        estado: "NUEVO",
        sesionId: r.sesionId,
        mesaCodigo: r.mesaCodigo,
        sessionToken,
        participanteToken,
        esAnfitrion: true,
        holdExpiraEn: r.holdExpiraEn,
      },
    };
  }),
);

sesionRouter.post(
  "/sesion/mesa/:mesaId/unirme",
  route(async (req) => {
    const { qrToken } = abrirSchema.parse(req.body);
    const payload = await verificarTokenMesa(qrToken);
    if (payload.mesaId !== req.params.mesaId) {
      throw new AppError(ErrorCode.INVALID_QR_TOKEN, "Token no corresponde a la mesa");
    }
    const r = await grupoService.unirme(payload.localId, req.params.mesaId);
    const cierreEstimadoIso = new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString();
    const sessionToken = await firmarSessionToken({
      sesionId: r.sesionId,
      mesaIds: r.mesaIds,
      cierreEstimadoIso,
    });
    const participanteToken = await firmarParticipanteToken({
      sesionId: r.sesionId,
      participanteId: r.participanteId,
    });
    return {
      body: { estado: "UNIDO", sesionId: r.sesionId, sessionToken, participanteToken, esAnfitrion: false },
    };
  }),
);

sesionRouter.get(
  "/sesion/actual",
  route(async (req) => {
    const payload = await requireOperativo(req);
    const sesion = await sesionRepo.findById(payload.sesionId);
    if (!sesion) throw new AppError(ErrorCode.NOT_FOUND, "Sesión no existe");
    const total = await sesionService.calcularTotal(sesion.id);
    return { body: { sesion, total } };
  }),
);

sesionRouter.post(
  "/pedidos",
  route(async (req) =>
    runIdempotent(req.header("idempotency-key") ?? null, "POST /api/pedidos", async () => {
      const payload = await requireOperativo(req);
      const body = pedidoCreateSchema.parse(req.body);
      const pedido = await pedidoService.crear({
        sesionId: payload.sesionId,
        origen: "CLIENTE",
        creadoPor: null,
        items: body.items,
      });
      return { status: 201, body: pedido };
    }),
  ),
);

sesionRouter.post(
  "/sesion/llamar-mozo",
  route(async (req) => {
    const payload = await requireOperativo(req);
    const ev = await eventosService.registrarConThrottle({
      sesionId: payload.sesionId,
      tipo: "LLAMAR_MOZO",
    });
    return { status: 201, body: ev };
  }),
);

sesionRouter.post(
  "/sesion/pedir-cuenta",
  route(async (req) => {
    const payload = await requireOperativo(req);
    const total = await sesionService.calcularTotal(payload.sesionId);
    const ev = await eventosService.registrarConThrottle({
      sesionId: payload.sesionId,
      tipo: "PEDIR_CUENTA",
      payload: { total },
    });
    return { status: 201, body: ev };
  }),
);

sesionRouter.post(
  "/sesion/encuesta",
  route(async (req) => {
    const tok = bearer(req);
    if (!tok) throw new AppError(ErrorCode.SESSION_EXPIRED, "Falta token");
    // Acepta token OPERATIVO o ENCUESTA_POST_CIERRE
    const payload = await verificarSessionToken(tok);
    const body = encuestaSchema.parse(req.body);
    const sesion = await prisma.sesionMesa.findUnique({ where: { id: payload.sesionId } });
    if (!sesion) throw new AppError(ErrorCode.NOT_FOUND, "Sesión no existe");
    const yaExiste = await prisma.encuesta.findUnique({ where: { sesionId: payload.sesionId } });
    if (yaExiste) throw new AppError(ErrorCode.VALIDATION, "Encuesta ya enviada");
    const enc = await prisma.encuesta.create({
      data: {
        sesionId: payload.sesionId,
        estrellas: body.estrellas,
        comentario: body.comentario,
      },
    });
    return { status: 201, body: enc };
  }),
);
