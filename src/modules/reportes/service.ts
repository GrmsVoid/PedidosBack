import { prisma } from "@/lib/prisma";
import { dinero, dividir, sumar, toDbString } from "@/lib/dinero";

export function agruparPorHora(pedidos: Array<{ confirmadoEn: Date }>): Record<number, number> {
  const map: Record<number, number> = {};
  for (const p of pedidos) {
    const h = p.confirmadoEn.getUTCHours();
    map[h] = (map[h] ?? 0) + 1;
  }
  return map;
}

export function calcularTicketPromedio(totales: string[]): string {
  if (totales.length === 0) return "0.00";
  const sum = totales.reduce((acc, t) => sumar(acc, dinero(t)), dinero("0"));
  return toDbString(dividir(sum, totales.length));
}

export const reportesService = {
  async ventas(desde: Date, hasta: Date) {
    const sesiones = await prisma.sesionMesa.findMany({
      where: { estado: "CERRADA", cerradaEn: { gte: desde, lte: hasta } },
      include: { pagos: true },
    });
    const totales = sesiones.map((s) =>
      toDbString(
        s.pagos.reduce((acc, p) => sumar(acc, dinero(p.monto.toString())), dinero("0")),
      ),
    );
    const total = totales.reduce((acc, t) => sumar(acc, dinero(t)), dinero("0"));
    return {
      sesiones: sesiones.length,
      total: toDbString(total),
      ticketPromedio: calcularTicketPromedio(totales),
    };
  },

  async topProductos(desde: Date, hasta: Date, limit: number) {
    const filas = await prisma.itemPedido.groupBy({
      by: ["productoId"],
      where: {
        productoId: { not: null },
        pedido: { estado: { not: "CANCELADO" }, confirmadoEn: { gte: desde, lte: hasta } },
      },
      _sum: { cantidad: true },
      orderBy: { _sum: { cantidad: "desc" } },
      take: limit,
    });
    const ids = filas.map((f) => f.productoId).filter((x): x is string => x !== null);
    const productos = await prisma.producto.findMany({ where: { id: { in: ids } } });
    const byId = new Map(productos.map((p) => [p.id, p]));
    return filas
      .filter((f) => f.productoId !== null)
      .map((f) => ({
        productoId: f.productoId as string,
        nombre: byId.get(f.productoId as string)?.nombre ?? "?",
        cantidadTotal: f._sum.cantidad ?? 0,
      }));
  },

  async horasPico(desde: Date, hasta: Date) {
    const pedidos = await prisma.pedido.findMany({
      where: { confirmadoEn: { gte: desde, lte: hasta }, estado: { not: "CANCELADO" } },
      select: { confirmadoEn: true },
    });
    return agruparPorHora(pedidos);
  },

  async satisfaccion(desde: Date, hasta: Date) {
    const encuestas = await prisma.encuesta.findMany({
      where: { creadaEn: { gte: desde, lte: hasta } },
      select: { estrellas: true, comentario: true },
    });
    const total = encuestas.length;
    const promedio = total === 0 ? 0 : encuestas.reduce((a, e) => a + e.estrellas, 0) / total;
    const distrib: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const e of encuestas) distrib[e.estrellas] = (distrib[e.estrellas] ?? 0) + 1;
    return { total, promedio: Number(promedio.toFixed(2)), distribucion: distrib };
  },

  async auditoria(tipo: string | null, desde: Date, hasta: Date) {
    return prisma.eventoSesion.findMany({
      where: {
        tipo: tipo ? (tipo as never) : undefined,
        creadoEn: { gte: desde, lte: hasta },
      },
      orderBy: { creadoEn: "desc" },
      take: 200,
    });
  },
};
