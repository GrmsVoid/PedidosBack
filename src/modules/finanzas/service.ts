import { prisma } from "@/lib/prisma";
import { dinero, sumar, toDbString, type Dinero } from "@/lib/dinero";

const LOCAL_ID = "demo-local";

type Decimalish = { toString(): string };
type Categorizado = { categoria: { nombre: string }; monto: Decimalish };

/** Suma montos agrupando por nombre de categoría, ordenado desc. */
function porCategoria(rows: Categorizado[]): { nombre: string; monto: string }[] {
  const map = new Map<string, Dinero>();
  for (const r of rows) {
    const prev = map.get(r.categoria.nombre) ?? dinero("0");
    map.set(r.categoria.nombre, sumar(prev, dinero(r.monto.toString())));
  }
  return [...map.entries()]
    .map(([nombre, d]) => ({ nombre, monto: toDbString(d) }))
    .sort((a, b) => Number(b.monto) - Number(a.monto));
}

type ItemConMods = {
  precioUnitarioCongelado: Decimalish;
  cantidad: number;
  modificadores: { deltaPrecioCongelado: Decimalish }[];
};

/** Total de una lista de ítems: (precio + Σ deltas) × cantidad. */
function totalItems(items: ItemConMods[]): Dinero {
  let total = dinero("0");
  for (const it of items) {
    const delta = it.modificadores.reduce(
      (a, m) => sumar(a, dinero(m.deltaPrecioCongelado.toString())),
      dinero("0"),
    );
    total = sumar(total, dinero(it.precioUnitarioCongelado.toString()).plus(delta).times(it.cantidad));
  }
  return total;
}

export const finanzasService = {
  /** Resumen financiero del rango: ingresos (caja + extra) − egresos = ganancia. */
  async resumen(desde: Date, hasta: Date) {
    const [pagos, ingresos, egresos, cancelados] = await Promise.all([
      prisma.pago.findMany({
        where: { registradoEn: { gte: desde, lte: hasta }, sesion: { localId: LOCAL_ID } },
        select: { monto: true },
      }),
      prisma.ingresoExtra.findMany({
        where: { localId: LOCAL_ID, fecha: { gte: desde, lte: hasta } },
        include: { categoria: true },
      }),
      prisma.egreso.findMany({
        where: { localId: LOCAL_ID, fecha: { gte: desde, lte: hasta } },
        include: { categoria: true },
      }),
      prisma.pedido.findMany({
        where: {
          estado: "CANCELADO",
          canceladoEn: { gte: desde, lte: hasta },
          sesion: { localId: LOCAL_ID },
        },
        include: { items: { include: { modificadores: true } } },
      }),
    ]);

    const ingresosCaja = pagos.reduce((a, p) => sumar(a, dinero(p.monto.toString())), dinero("0"));
    const ingresosExtra = ingresos.reduce((a, i) => sumar(a, dinero(i.monto.toString())), dinero("0"));
    const totalEgresos = egresos.reduce((a, e) => sumar(a, dinero(e.monto.toString())), dinero("0"));
    const ingresosTotal = sumar(ingresosCaja, ingresosExtra);
    const ganancia = ingresosTotal.minus(totalEgresos);
    const margen = ingresosTotal.isZero()
      ? 0
      : Number(ganancia.div(ingresosTotal).times(100).toFixed(1));
    const cancMonto = cancelados.reduce((a, p) => sumar(a, totalItems(p.items)), dinero("0"));

    return {
      ingresosCaja: toDbString(ingresosCaja),
      ingresosExtra: toDbString(ingresosExtra),
      ingresosTotal: toDbString(ingresosTotal),
      egresos: toDbString(totalEgresos),
      ganancia: toDbString(ganancia),
      margen,
      pagosCount: pagos.length,
      egresosPorCategoria: porCategoria(egresos),
      ingresosPorCategoria: porCategoria(ingresos),
      cancelados: { count: cancelados.length, monto: toDbString(cancMonto) },
    };
  },

  /** Lista de pedidos cancelados en el rango (con monto estimado perdido). */
  async cancelados(desde: Date, hasta: Date) {
    const pedidos = await prisma.pedido.findMany({
      where: {
        estado: "CANCELADO",
        canceladoEn: { gte: desde, lte: hasta },
        sesion: { localId: LOCAL_ID },
      },
      include: {
        items: { include: { producto: true, modificadores: true } },
        sesion: { include: { mesas: { include: { mesa: true } } } },
      },
      orderBy: { canceladoEn: "desc" },
      take: 200,
    });
    return pedidos.map((p) => ({
      id: p.id,
      numeroSesion: p.numeroSesion,
      canceladoEn: p.canceladoEn,
      motivo: p.canceladoMotivo,
      origen: p.origen,
      mesas: p.sesion.mesas.map((m) => m.mesa.codigo),
      monto: toDbString(totalItems(p.items)),
      items: p.items.map((it) => ({
        nombre: it.producto?.nombre ?? it.nombreCongelado ?? "—",
        cantidad: it.cantidad,
      })),
    }));
  },

  /** Presupuesto de un mes: por cada categoría de gasto, límite vs gastado real. */
  async presupuestos(anio: number, mes: number) {
    const start = new Date(anio, mes - 1, 1);
    const end = new Date(anio, mes, 1);
    const [cats, gastos, presupuestos] = await Promise.all([
      prisma.categoriaGasto.findMany({
        where: { localId: LOCAL_ID, deletedAt: null },
        orderBy: { orden: "asc" },
      }),
      prisma.egreso.groupBy({
        by: ["categoriaId"],
        where: { localId: LOCAL_ID, fecha: { gte: start, lt: end } },
        _sum: { monto: true },
      }),
      prisma.presupuesto.findMany({ where: { localId: LOCAL_ID, anio, mes } }),
    ]);

    const gastadoBy = new Map(gastos.map((g) => [g.categoriaId, g._sum.monto?.toString() ?? "0"]));
    const presBy = new Map(presupuestos.map((p) => [p.categoriaId, p]));

    let totalLimite = dinero("0");
    let totalGastado = dinero("0");

    const categorias = cats.map((c) => {
      const gastado = dinero(gastadoBy.get(c.id) ?? "0");
      const pres = presBy.get(c.id);
      const limite = pres ? dinero(pres.montoLimite.toString()) : null;
      totalGastado = sumar(totalGastado, gastado);
      if (limite) totalLimite = sumar(totalLimite, limite);

      const pct = limite && !limite.isZero() ? Number(gastado.div(limite).times(100).toFixed(0)) : null;
      let estado: "sin" | "ok" | "alerta" | "excedido" = "sin";
      if (limite) {
        if (gastado.gt(limite)) estado = "excedido";
        else if (pct !== null && pct >= 80) estado = "alerta";
        else estado = "ok";
      }

      return {
        categoriaId: c.id,
        nombre: c.nombre,
        presupuestoId: pres?.id ?? null,
        limite: limite ? toDbString(limite) : null,
        gastado: toDbString(gastado),
        restante: limite ? toDbString(limite.minus(gastado)) : null,
        pct,
        estado,
      };
    });

    return {
      anio,
      mes,
      totalLimite: toDbString(totalLimite),
      totalGastado: toDbString(totalGastado),
      categorias,
    };
  },
};
