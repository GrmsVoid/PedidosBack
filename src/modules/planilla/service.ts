import { prisma } from "@/lib/prisma";
import { dinero, sumar, toDbString } from "@/lib/dinero";
import { AppError, ErrorCode } from "@/lib/errors";

const LOCAL_ID = "demo-local";

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

type Linea = {
  usuarioId: string;
  nombre: string;
  tipoRemuneracion: "FIJO_MENSUAL" | "POR_HORA" | "POR_TURNO";
  base: string;
  turnos: number;
  horas: string;
  monto: string;
};

/** Calcula las líneas de planilla del mes a partir de turnos + tipo de remuneración. */
async function calcular(anio: number, mes: number): Promise<{ lineas: Linea[]; total: string }> {
  const start = new Date(anio, mes - 1, 1);
  const end = new Date(anio, mes, 1);
  const usuarios = await prisma.usuario.findMany({
    where: { activo: true, deletedAt: null },
    include: { turnos: { where: { fecha: { gte: start, lt: end } } } },
    orderBy: { nombre: "asc" },
  });

  const lineas: Linea[] = [];
  let total = dinero("0");
  for (const u of usuarios) {
    const turnos = u.turnos.length;
    const totalMin = u.turnos.reduce(
      (a, t) => a + Math.max(0, minutos(t.horaFin) - minutos(t.horaInicio)),
      0,
    );
    const horas = dinero(totalMin).div(60);

    let base = dinero("0");
    let monto = dinero("0");
    if (u.tipoRemuneracion === "FIJO_MENSUAL") {
      base = dinero(u.sueldoMensual?.toString() ?? "0");
      monto = base;
    } else if (u.tipoRemuneracion === "POR_HORA") {
      base = dinero(u.tarifaHora?.toString() ?? "0");
      monto = base.times(horas);
    } else {
      base = dinero(u.montoTurno?.toString() ?? "0");
      monto = base.times(turnos);
    }
    total = sumar(total, monto);
    lineas.push({
      usuarioId: u.id,
      nombre: u.nombre,
      tipoRemuneracion: u.tipoRemuneracion,
      base: toDbString(base),
      turnos,
      horas: toDbString(horas),
      monto: toDbString(monto),
    });
  }
  return { lineas, total: toDbString(total) };
}

export const planillaService = {
  /** Planilla del mes: la cerrada (persistida) o, si no existe, el cálculo en borrador. */
  async preview(anio: number, mes: number) {
    const periodo = await prisma.planillaPeriodo.findUnique({
      where: { localId_anio_mes: { localId: LOCAL_ID, anio, mes } },
      include: { lineas: { orderBy: { nombre: "asc" } } },
    });
    if (periodo) {
      return {
        estado: "CERRADA" as const,
        anio,
        mes,
        periodoId: periodo.id,
        egresoId: periodo.egresoId,
        generadoEn: periodo.generadoEn,
        total: periodo.total.toString(),
        lineas: periodo.lineas.map((l) => ({
          usuarioId: l.usuarioId,
          nombre: l.nombre,
          tipoRemuneracion: l.tipoRemuneracion,
          base: l.base.toString(),
          turnos: l.turnos,
          horas: l.horas.toString(),
          monto: l.monto.toString(),
        })),
      };
    }
    const { lineas, total } = await calcular(anio, mes);
    return {
      estado: "BORRADOR" as const,
      anio,
      mes,
      periodoId: null,
      egresoId: null,
      generadoEn: null,
      total,
      lineas,
    };
  },

  /** Cierra la planilla del mes: persiste el periodo + líneas y genera el egreso "Planilla". */
  async cerrar(anio: number, mes: number) {
    const existe = await prisma.planillaPeriodo.findUnique({
      where: { localId_anio_mes: { localId: LOCAL_ID, anio, mes } },
    });
    if (existe) throw new AppError(ErrorCode.VALIDATION, "La planilla de ese mes ya está cerrada");

    const { lineas, total } = await calcular(anio, mes);

    let cat = await prisma.categoriaGasto.findFirst({
      where: { localId: LOCAL_ID, nombre: "Planilla", deletedAt: null },
    });
    if (!cat) {
      cat = await prisma.categoriaGasto.create({
        data: { localId: LOCAL_ID, nombre: "Planilla", orden: 99 },
      });
    }
    const catId = cat.id;
    const fechaEgreso = new Date(anio, mes, 0); // último día del mes

    return prisma.$transaction(async (tx) => {
      const egreso = await tx.egreso.create({
        data: {
          localId: LOCAL_ID,
          categoriaId: catId,
          monto: total,
          fecha: fechaEgreso,
          descripcion: `Planilla ${String(mes).padStart(2, "0")}/${anio}`,
          origen: "PLANILLA",
        },
      });
      return tx.planillaPeriodo.create({
        data: {
          localId: LOCAL_ID,
          anio,
          mes,
          estado: "CERRADA",
          total,
          egresoId: egreso.id,
          lineas: {
            create: lineas.map((l) => ({
              usuarioId: l.usuarioId,
              nombre: l.nombre,
              tipoRemuneracion: l.tipoRemuneracion,
              base: l.base,
              turnos: l.turnos,
              horas: l.horas,
              monto: l.monto,
            })),
          },
        },
        include: { lineas: true },
      });
    });
  },

  /** Reabre (anula) una planilla: borra el periodo, sus líneas y el egreso generado. */
  async reabrir(periodoId: string) {
    const periodo = await prisma.planillaPeriodo.findFirst({
      where: { id: periodoId, localId: LOCAL_ID },
    });
    if (!periodo) throw new AppError(ErrorCode.NOT_FOUND, "Planilla no existe");
    await prisma.$transaction(async (tx) => {
      await tx.planillaPeriodo.delete({ where: { id: periodoId } });
      if (periodo.egresoId) await tx.egreso.deleteMany({ where: { id: periodo.egresoId } });
    });
    return { ok: true };
  },
};
