import { prisma } from "@/lib/prisma";

export const pedidoRepo = {
  findById(id: string) {
    return prisma.pedido.findUnique({
      where: { id },
      include: { items: { include: { modificadores: true } } },
    });
  },

  async siguienteNumero(sesionId: string): Promise<number> {
    const max = await prisma.pedido.aggregate({
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
      include: { items: { include: { producto: true, modificadores: true } } },
      orderBy: { confirmadoEn: "asc" },
    });
  },
};
