import { prisma } from "@/lib/prisma";
import type { MenuPayload } from "./types";

export const catalogoRepo = {
  async getMenu(localId: string): Promise<MenuPayload> {
    const categorias = await prisma.categoria.findMany({
      where: { localId, activa: true, deletedAt: null },
      orderBy: { orden: "asc" },
      include: {
        productos: {
          where: { deletedAt: null },
          orderBy: { orden: "asc" },
          include: {
            grupos: {
              orderBy: { orden: "asc" },
              include: { opciones: { orderBy: { orden: "asc" } } },
            },
          },
        },
      },
    });

    return {
      categorias: categorias.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        orden: c.orden,
        productos: c.productos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          descripcion: p.descripcion,
          imagenUrl: p.imagenUrl,
          precioBase: p.precioBase.toString(),
          prepTimeMinutes: p.prepTimeMinutes,
          disponible: p.disponible,
          orden: p.orden,
          grupos: p.grupos.map((g) => ({
            id: g.id,
            nombre: g.nombre,
            obligatorio: g.obligatorio,
            minSeleccion: g.minSeleccion,
            maxSeleccion: g.maxSeleccion,
            opciones: g.opciones.map((o) => ({
              id: o.id,
              nombre: o.nombre,
              deltaPrecio: o.deltaPrecio.toString(),
              disponible: o.disponible,
            })),
          })),
        })),
      })),
    };
  },

  async findProductoConModificadores(productoId: string) {
    return prisma.producto.findUnique({
      where: { id: productoId, deletedAt: null },
      include: { grupos: { include: { opciones: true } } },
    });
  },

  async setDisponibilidad(productoId: string, disponible: boolean): Promise<void> {
    await prisma.producto.update({
      where: { id: productoId },
      data: { disponible },
    });
    try {
      const { emit } = await import("@/realtime/emitter");
      // En V1 no hay una room "todas las mesas"; emitimos a admin y los clientes
      // hacen refetch del menú al volver. Broadcast amplio queda para Plan 2.
      emit("admin", "producto:disponibilidad", { productoId, disponible });
    } catch (e) {
      const { logger } = await import("@/lib/logger");
      logger.warn("Emit producto:disponibilidad falló", { err: (e as Error).message });
    }
  },
};
