import { prisma } from "@/lib/prisma";
import type { MenuPayload } from "./types";

/** Fecha de hoy (servidor) como medianoche UTC, para casar con columnas @db.Date. */
export function fechaHoyUTC(): Date {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return new Date(`${ymd}T00:00:00.000Z`);
}

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

    // Precios especiales de hoy y combos disponibles.
    const fechaHoy = fechaHoyUTC();
    const precios = await prisma.precioDia.findMany({ where: { localId, fecha: fechaHoy } });
    const precioBy = new Map(precios.map((p) => [p.productoId, p.precio.toString()]));
    const combos = await prisma.combo.findMany({
      where: { localId, disponible: true, deletedAt: null },
      orderBy: { orden: "asc" },
      include: { items: { include: { producto: true } } },
    });

    return {
      categorias: categorias.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        orden: c.orden,
        productos: c.productos.map((p) => {
          const especial = precioBy.get(p.id);
          return {
            id: p.id,
            nombre: p.nombre,
            descripcion: p.descripcion,
            imagenUrl: p.imagenUrl,
            precioBase: especial ?? p.precioBase.toString(),
            precioAntes: especial ? p.precioBase.toString() : null,
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
          };
        }),
      })),
      combos: combos.map((co) => ({
        id: co.id,
        nombre: co.nombre,
        descripcion: co.descripcion,
        precio: co.precio.toString(),
        items: co.items.map((i) => ({ nombre: i.producto.nombre, cantidad: i.cantidad })),
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
      emit("admin", "producto:disponibilidad", { productoId, disponible });
    } catch (e) {
      const { logger } = await import("@/lib/logger");
      logger.warn("Emit producto:disponibilidad falló", { err: (e as Error).message });
    }
  },
};
