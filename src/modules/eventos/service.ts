import { prisma } from "@/lib/prisma";
import { AppError, ErrorCode } from "@/lib/errors";
import type { EventoTipo, Prisma } from "@prisma/client";

const VENTANA_THROTTLE_MIN = 5;

export const eventosService = {
  async registrarConThrottle(opts: {
    sesionId: string;
    tipo: EventoTipo;
    payload?: Prisma.InputJsonValue;
  }) {
    return prisma.$transaction(async (tx) => {
      const cutoff = new Date(Date.now() - VENTANA_THROTTLE_MIN * 60_000);
      const activo = await tx.eventoSesion.findFirst({
        where: {
          sesionId: opts.sesionId,
          tipo: opts.tipo,
          atendido: false,
          creadoEn: { gte: cutoff },
        },
      });
      if (activo) {
        throw new AppError(ErrorCode.THROTTLED, "Ya hay una solicitud activa para este evento", {
          existenteId: activo.id,
        });
      }
      const evento = await tx.eventoSesion.create({
        data: { sesionId: opts.sesionId, tipo: opts.tipo, payloadJson: opts.payload ?? {} },
      });
      try {
        const { emit } = await import("@/realtime/emitter");
        const sesion = await tx.sesionMesa.findUniqueOrThrow({
          where: { id: opts.sesionId },
          include: { mesas: { include: { mesa: true } } },
        });
        const mesaCodigo = sesion.mesas[0]?.mesa.codigo ?? "?";
        if (opts.tipo === "LLAMAR_MOZO") {
          emit("mozos", "evento:llamar_mozo", {
            eventoId: evento.id,
            sesionId: opts.sesionId,
            mesa: mesaCodigo,
            marcaTiempo: new Date().toISOString(),
          });
        } else if (opts.tipo === "PEDIR_CUENTA") {
          emit(["caja", "mozos"], "evento:pedir_cuenta", {
            eventoId: evento.id,
            sesionId: opts.sesionId,
            mesa: mesaCodigo,
            totalActual: String((opts.payload as { total?: string })?.total ?? "0.00"),
          });
        }
      } catch (e) {
        const { logger } = await import("@/lib/logger");
        logger.warn("Emit evento falló", { err: (e as Error).message });
      }
      return evento;
    });
  },

  async atender(id: string, atendidoPor: string) {
    return prisma.eventoSesion.update({
      where: { id },
      data: { atendido: true, atendidoEn: new Date(), atendidoPor },
    });
  },
};
