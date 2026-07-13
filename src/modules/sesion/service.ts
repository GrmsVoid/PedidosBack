import { prisma } from "@/lib/prisma";
import { sesionRepo } from "./repository";
import { mesaRepo } from "@/modules/mesa/repository";
import { withTransaction, type TxContext } from "@/lib/tx";
import { AppError, ErrorCode } from "@/lib/errors";
import { dinero, sumar, toDbString } from "@/lib/dinero";
import { firmarSessionToken } from "@/lib/session-token";
import { MesaEstado, type Prisma } from "@prisma/client";

/**
 * Lee el estado final de las mesas dentro de la transacción y DIFIERE el
 * mesa:estado hasta después del commit (best-effort; Socket.IO puede no estar
 * arriba en tests). Así los clientes nunca ven un estado que luego se revierte.
 */
async function emitirMesasEstado(
  tx: Prisma.TransactionClient,
  emitAfter: TxContext["emitAfter"],
  mesaIds: string[],
): Promise<void> {
  const mesasFinales = await tx.mesa.findMany({ where: { id: { in: mesaIds } } });
  const estados = mesasFinales.map((m) => ({ mesaId: m.id, estado: m.estado }));
  emitAfter((emit) => {
    for (const e of estados) emit(["mozos", "admin"], "mesa:estado", e);
  });
}

export const sesionService = {
  async abrirOAdjuntar(localId: string, mesaId: string) {
    return withTransaction(async ({ tx, emitAfter }) => {
      await mesaRepo.lockManyForUpdate(tx, [mesaId]);
      const mesa = await tx.mesa.findUniqueOrThrow({ where: { id: mesaId } });

      if (mesa.estado === MesaEstado.OCUPADA || mesa.estado === MesaEstado.UNIDA) {
        const activa = await tx.sesionMesa.findFirst({
          where: { estado: "ABIERTA", mesas: { some: { mesaId } } },
          include: { mesas: true },
        });
        if (activa) return activa;
      }

      if (mesa.estado !== MesaEstado.LIBRE) {
        throw new AppError(ErrorCode.TABLE_BUSY, "Mesa no disponible para nueva sesión", {
          mesaId,
        });
      }

      const sesion = await sesionRepo.crear(tx, localId, [mesaId]);
      await tx.mesa.update({ where: { id: mesaId }, data: { estado: MesaEstado.OCUPADA } });
      await emitirMesasEstado(tx, emitAfter, sesion.mesas.map((sm) => sm.mesaId));
      return sesion;
    });
  },

  async unirMesas(localId: string, mesaIds: string[]) {
    if (mesaIds.length < 2) {
      throw new AppError(ErrorCode.VALIDATION, "Unir requiere 2+ mesas");
    }
    return withTransaction(async ({ tx, emitAfter }) => {
      await mesaRepo.lockManyForUpdate(tx, mesaIds);
      const mesas = await tx.mesa.findMany({ where: { id: { in: mesaIds } } });
      if (mesas.length !== mesaIds.length) {
        throw new AppError(ErrorCode.NOT_FOUND, "Alguna mesa no existe");
      }
      const todasLibres = mesas.every((m) => m.estado === MesaEstado.LIBRE);
      if (!todasLibres) {
        throw new AppError(ErrorCode.TABLE_NOT_FREE, "Solo se pueden unir mesas libres", {
          mesaIds: mesas.filter((m) => m.estado !== MesaEstado.LIBRE).map((m) => m.id),
        });
      }
      const sesion = await sesionRepo.crear(tx, localId, mesaIds);
      await tx.mesa.updateMany({
        where: { id: { in: mesaIds } },
        data: { estado: MesaEstado.UNIDA },
      });
      await tx.eventoSesion.create({
        data: { sesionId: sesion.id, tipo: "MESA_UNIDA", payloadJson: { mesaIds } },
      });
      await emitirMesasEstado(tx, emitAfter, mesaIds);
      return sesion;
    });
  },

  async separarMesa(_localId: string, mesaId: string) {
    return withTransaction(async ({ tx, emitAfter }) => {
      await mesaRepo.lockManyForUpdate(tx, [mesaId]);
      const mesa = await tx.mesa.findUnique({ where: { id: mesaId } });
      if (!mesa) throw new AppError(ErrorCode.NOT_FOUND, "Mesa no existe");
      if (mesa.estado !== MesaEstado.UNIDA) {
        throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, "La mesa no está unida");
      }

      // Sesión ABIERTA que contiene esta mesa, con todas sus mesas.
      const enlace = await tx.sesionMesaMesas.findFirst({
        where: { mesaId, sesion: { estado: "ABIERTA" } },
        include: { sesion: { include: { mesas: true } } },
      });
      // UNIDA sin sesión activa = estado inconsistente → liberar y salir.
      if (!enlace) {
        await tx.mesa.update({ where: { id: mesaId }, data: { estado: MesaEstado.LIBRE } });
        await emitirMesasEstado(tx, emitAfter, [mesaId]);
        return { ok: true, mesasRestantes: [] as string[] };
      }

      const sesion = enlace.sesion;
      const companeras = sesion.mesas
        .map((sm) => sm.mesaId)
        .filter((id) => id !== mesaId);

      // UNIDA pero sola en su sesión = inconsistencia → pasa a OCUPADA.
      if (companeras.length === 0) {
        await tx.mesa.update({ where: { id: mesaId }, data: { estado: MesaEstado.OCUPADA } });
        await emitirMesasEstado(tx, emitAfter, [mesaId]);
        return { ok: true, mesasRestantes: [mesaId] };
      }

      // Con pedidos hay consumo compartido: no se puede separar la cuenta.
      const pedidos = await tx.pedido.count({ where: { sesionId: sesion.id } });
      if (pedidos > 0) {
        throw new AppError(
          ErrorCode.INVALID_STATE_TRANSITION,
          "Mesas con pedidos no pueden separarse; cierra la cuenta primero",
        );
      }

      // Sacar la mesa de la sesión y liberarla.
      await tx.sesionMesaMesas.delete({
        where: { sesionId_mesaId: { sesionId: sesion.id, mesaId } },
      });
      await tx.mesa.update({ where: { id: mesaId }, data: { estado: MesaEstado.LIBRE } });

      // Si queda una sola compañera, deja de estar "unida".
      if (companeras.length === 1) {
        await tx.mesa.update({
          where: { id: companeras[0] },
          data: { estado: MesaEstado.OCUPADA },
        });
      }

      await tx.eventoSesion.create({
        data: { sesionId: sesion.id, tipo: "MESA_SEPARADA", payloadJson: { mesaId } },
      });
      await emitirMesasEstado(tx, emitAfter, [mesaId, ...companeras]);
      return { ok: true, mesasRestantes: companeras };
    });
  },

  /**
   * Suma el consumo no cancelado de la sesión. Acepta el cliente de una
   * transacción (`tx`) para leer dentro del mismo snapshot cuando se combina
   * con un lock de la cuenta (cobro/cierre); por defecto usa la conexión normal.
   */
  async calcularTotal(
    sesionId: string,
    client: Prisma.TransactionClient = prisma,
  ): Promise<string> {
    const sesion = await client.sesionMesa.findUniqueOrThrow({
      where: { id: sesionId },
      include: { pedidos: { include: { items: true } } },
    });
    let total = dinero("0");
    for (const p of sesion.pedidos) {
      if (p.estado === "CANCELADO") continue;
      for (const it of p.items) {
        // precioUnitarioCongelado ya incluye base + deltas de modificadores (snapshot)
        const unitario = dinero(it.precioUnitarioCongelado.toString());
        total = sumar(total, unitario.times(it.cantidad));
      }
    }
    return toDbString(total);
  },

  async cerrar(sesionId: string, cerradoPor: string) {
    return withTransaction(async ({ tx, emitAfter }) => {
      // Lock de la cuenta: impide que entre un cobro entre el chequeo de
      // completitud y el cierre (evita cerrar con un pago a medio registrar).
      await sesionRepo.lockForUpdate(tx, sesionId);
      const sesion = await tx.sesionMesa.findUniqueOrThrow({
        where: { id: sesionId },
        include: { mesas: true, pedidos: true, pagos: true },
      });
      if (sesion.estado !== "ABIERTA") {
        throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, "Sesión ya cerrada");
      }
      const enPrep = sesion.pedidos.some(
        (p) => p.estado === "CONFIRMADO" || p.estado === "EN_PREPARACION",
      );
      if (enPrep) {
        throw new AppError(ErrorCode.ORDERS_IN_PROGRESS, "Hay pedidos sin entregar");
      }

      // Sumar pagos (total dentro del mismo snapshot del lock)
      const total = await this.calcularTotal(sesionId, tx);
      const totalPagado = sesion.pagos.reduce(
        (acc, p) => sumar(acc, dinero(p.monto.toString())),
        dinero("0"),
      );
      if (totalPagado.lt(dinero(total))) {
        const restante = dinero(total).minus(totalPagado);
        throw new AppError(ErrorCode.PAYMENT_INCOMPLETE, "Falta cobrar", {
          restante: restante.toFixed(2),
        });
      }

      await tx.sesionMesa.update({
        where: { id: sesionId },
        data: {
          estado: "CERRADA",
          cerradaEn: new Date(),
          cerradaPor: cerradoPor,
          encuestaSolicitada: true,
        },
      });
      await tx.mesa.updateMany({
        where: { id: { in: sesion.mesas.map((sm) => sm.mesaId) } },
        data: { estado: "LIBRE" },
      });
      const tokenEncuesta = await firmarSessionToken({
        sesionId,
        mesaIds: sesion.mesas.map((sm) => sm.mesaId),
        cierreEstimadoIso: new Date(Date.now() + 10 * 60_000).toISOString(),
        tipo: "ENCUESTA_POST_CIERRE",
      });
      const mesaIds = sesion.mesas.map((sm) => sm.mesaId);
      emitAfter((emit) => {
        emit(["mozos", "caja", "admin"], "sesion:cerrada", { sesionId, mesaIds });
        for (const mid of mesaIds) {
          emit(`mesa:${mid}`, "sesion:cerrada", { sesionId, mesaIds });
        }
      });
      return { ok: true, tokenEncuesta };
    });
  },

  async cerrarSinPago(sesionId: string, cerradoPor: string, motivo: string) {
    return withTransaction(async ({ tx, emitAfter }) => {
      await sesionRepo.lockForUpdate(tx, sesionId);
      const sesion = await tx.sesionMesa.findUniqueOrThrow({
        where: { id: sesionId },
        include: { mesas: true },
      });
      if (sesion.estado !== "ABIERTA") {
        throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, "Sesión ya cerrada");
      }
      await tx.sesionMesa.update({
        where: { id: sesionId },
        data: { estado: "FUGADA", cerradaEn: new Date(), cerradaPor: cerradoPor },
      });
      await tx.mesa.updateMany({
        where: { id: { in: sesion.mesas.map((sm) => sm.mesaId) } },
        data: { estado: "LIBRE" },
      });
      await tx.eventoSesion.create({
        data: {
          sesionId,
          tipo: "CIERRE_SIN_PAGO",
          payloadJson: { motivo },
          actorUsuarioId: cerradoPor,
        },
      });
      const mesaIds = sesion.mesas.map((sm) => sm.mesaId);
      emitAfter((emit) => {
        emit(["mozos", "caja", "admin"], "sesion:cerrada", { sesionId, mesaIds });
        for (const mid of mesaIds) {
          emit(`mesa:${mid}`, "sesion:cerrada", { sesionId, mesaIds });
          emit(["mozos", "admin"], "mesa:estado", { mesaId: mid, estado: "LIBRE" });
        }
      });
      return { ok: true };
    });
  },
};
