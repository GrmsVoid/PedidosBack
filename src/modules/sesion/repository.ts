import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const sesionRepo = {
  async findActivaPorMesa(mesaId: string) {
    return prisma.sesionMesa.findFirst({
      where: { estado: "ABIERTA", mesas: { some: { mesaId } } },
      include: {
        mesas: true,
        pedidos: { include: { items: { include: { modificadores: true } } } },
        pagos: true,
      },
    });
  },

  async findById(id: string) {
    return prisma.sesionMesa.findUnique({
      where: { id },
      include: {
        mesas: { include: { mesa: true } },
        pedidos: { include: { items: { include: { modificadores: true } } } },
        pagos: true,
        eventos: true,
        encuesta: true,
      },
    });
  },

  /**
   * Bloquea la fila de la sesión (SELECT ... FOR UPDATE) para serializar
   * operaciones concurrentes sobre su cuenta (p. ej. cobros simultáneos desde
   * dos cajas). Devuelve [] si la sesión no existe.
   */
  async lockForUpdate(tx: Prisma.TransactionClient, sesionId: string) {
    return tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "SesionMesa" WHERE id = ${sesionId} FOR UPDATE
    `;
  },

  async crear(tx: Prisma.TransactionClient, localId: string, mesaIds: string[]) {
    return tx.sesionMesa.create({
      data: {
        localId,
        mesas: { create: mesaIds.map((mesaId) => ({ mesaId })) },
      },
      include: { mesas: true },
    });
  },
};
