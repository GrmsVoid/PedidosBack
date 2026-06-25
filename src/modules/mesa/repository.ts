import { prisma } from "@/lib/prisma";
import { MesaEstado, type Prisma } from "@prisma/client";

export const mesaRepo = {
  async listarPorLocal(localId: string) {
    return prisma.mesa.findMany({
      where: { localId, deletedAt: null },
      orderBy: [{ posicionY: "asc" }, { posicionX: "asc" }],
    });
  },

  async findById(id: string) {
    return prisma.mesa.findUnique({ where: { id } });
  },

  async lockManyForUpdate(tx: Prisma.TransactionClient, ids: string[]) {
    if (ids.length === 0) return [];
    // Postgres SELECT ... FOR UPDATE via $queryRaw
    return tx.$queryRaw<Array<{ id: string; estado: MesaEstado }>>`
      SELECT id, estado FROM "Mesa" WHERE id = ANY(${ids}::text[]) FOR UPDATE
    `;
  },

  async setEstado(tx: Prisma.TransactionClient, id: string, estado: MesaEstado) {
    return tx.mesa.update({ where: { id }, data: { estado } });
  },
};
