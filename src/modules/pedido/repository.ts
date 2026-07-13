import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const pedidoRepo = {
  findById(id: string) {
    return prisma.pedido.findUnique({
      where: { id },
      include: { items: { include: { modificadores: true } } },
    });
  },

  /**
   * Siguiente número de pedido dentro de la sesión. Debe correr con el cliente
   * de la transacción (`tx`) para leer el mismo snapshot en el que se insertará;
   * aun así, ante concurrencia el índice único (sesionId, numeroSesion) puede
   * rechazar la inserción → el llamador reintenta (ver conReintentoConflicto).
   */
  async siguienteNumero(
    tx: Prisma.TransactionClient,
    sesionId: string,
  ): Promise<number> {
    const max = await tx.pedido.aggregate({
      where: { sesionId },
      _max: { numeroSesion: true },
    });
    return (max._max.numeroSesion ?? 0) + 1;
  },

  async colaPorEstacion(estacionId: string) {
    return prisma.pedido.findMany({
      where: {
        estado: { in: ["CONFIRMADO", "EN_PREPARACION"] },
        items: { some: { estacionIdCongelada: estacionId } },
      },
      include: {
        items: {
          include: {
            producto: true,
            modificadores: true,
            combo: { include: { items: { include: { producto: true } } } },
          },
        },
      },
      orderBy: { confirmadoEn: "asc" },
    });
  },
};
