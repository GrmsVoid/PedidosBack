import { Router, type Request } from "express";
import { z } from "zod";
import { grupoService } from "@/modules/grupo/service";
import { bearer } from "@/lib/authorize";
import { verificarParticipanteToken, type ParticipanteTokenPayload } from "@/lib/grupo-token";
import { itemInputSchema } from "@/lib/schemas/pedido";
import { AppError, ErrorCode } from "@/lib/errors";
import { route } from "./handler";

const nombreSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "Cuéntanos tu nombre (mín. 2 letras)")
    .max(30)
    .transform((s) => s.replace(/\s+/g, " ")),
});

export const grupoRouter = Router();

async function requireParticipante(req: Request): Promise<ParticipanteTokenPayload> {
  const tok = bearer(req);
  if (!tok) throw new AppError(ErrorCode.SESSION_EXPIRED, "Falta token de participante");
  return verificarParticipanteToken(tok);
}

grupoRouter.get(
  "/grupo/estado",
  route(async (req) => {
    const { participanteId } = await requireParticipante(req);
    return { body: await grupoService.estado(participanteId) };
  }),
);

grupoRouter.patch(
  "/grupo/nombre",
  route(async (req) => {
    const { participanteId } = await requireParticipante(req);
    const { nombre } = nombreSchema.parse(req.body);
    return { body: await grupoService.renombrar(participanteId, nombre) };
  }),
);

grupoRouter.post(
  "/grupo/carrito",
  route(async (req) => {
    const { participanteId } = await requireParticipante(req);
    const body = itemInputSchema.parse(req.body);
    return {
      body: await grupoService.agregarItem(participanteId, {
        productoId: body.productoId,
        comboId: body.comboId,
        cantidad: body.cantidad,
        opcionesIds: body.opcionesIds,
        notaLibre: body.notaLibre,
      }),
    };
  }),
);

grupoRouter.delete(
  "/grupo/carrito/:itemId",
  route(async (req) => {
    const { participanteId } = await requireParticipante(req);
    return { body: await grupoService.quitarItem(participanteId, req.params.itemId) };
  }),
);

grupoRouter.post(
  "/grupo/aceptar",
  route(async (req) => {
    const { participanteId } = await requireParticipante(req);
    return { body: await grupoService.aceptar(participanteId) };
  }),
);

grupoRouter.post(
  "/grupo/salir",
  route(async (req) => {
    const { participanteId } = await requireParticipante(req);
    return { body: await grupoService.salir(participanteId) };
  }),
);

grupoRouter.post(
  "/grupo/anfitrion/quitar/:participanteId",
  route(async (req) => {
    const { participanteId } = await requireParticipante(req);
    return { body: await grupoService.quitarParticipante(participanteId, req.params.participanteId) };
  }),
);

grupoRouter.post(
  "/grupo/anfitrion/forzar",
  route(async (req) => {
    const { participanteId } = await requireParticipante(req);
    return { body: await grupoService.forzar(participanteId) };
  }),
);
