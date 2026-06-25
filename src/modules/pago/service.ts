import { prisma } from "@/lib/prisma";
import { dinero, dividir, sumar, toDbString } from "@/lib/dinero";
import { sesionService } from "@/modules/sesion/service";
import { AppError, ErrorCode } from "@/lib/errors";
import type { MetodoPago } from "@prisma/client";

export function dividirEnComensales(total: string, n: number): string[] {
  if (n <= 0) throw new Error("n debe ser > 0");
  const totalD = dinero(total);
  const parteBase = dividir(totalD, n);
  const truncadas = Array.from({ length: n - 1 }, () => toDbString(parteBase));
  const sumaTruncadas = truncadas.reduce((acc, v) => sumar(acc, dinero(v)), dinero("0"));
  const ultima = toDbString(totalD.minus(sumaTruncadas));
  return [...truncadas, ultima];
}

export function restanteEnSesion(total: string, pagos: string[]): string {
  const pagado = pagos.reduce((acc, p) => sumar(acc, dinero(p)), dinero("0"));
  const restante = dinero(total).minus(pagado);
  return toDbString(restante.isNegative() ? dinero("0") : restante);
}

export const pagoService = {
  async registrar(opts: {
    sesionId: string;
    metodo: MetodoPago;
    monto: string;
    cajeroId: string;
    comensalNum: number | null;
  }) {
    return prisma.$transaction(async (tx) => {
      const sesion = await tx.sesionMesa.findUniqueOrThrow({
        where: { id: opts.sesionId },
        include: { pagos: true },
      });
      if (sesion.estado !== "ABIERTA") {
        throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, "Sesión ya cerrada");
      }
      const total = await sesionService.calcularTotal(opts.sesionId);
      const pagado = sesion.pagos.reduce(
        (acc, p) => sumar(acc, dinero(p.monto.toString())),
        dinero("0"),
      );
      const restanteActual = dinero(total).minus(pagado);
      if (dinero(opts.monto).gt(restanteActual.plus(dinero("0.01")))) {
        throw new AppError(ErrorCode.VALIDATION, "Pago excede el restante", {
          restante: toDbString(restanteActual),
        });
      }
      const pago = await tx.pago.create({
        data: {
          sesionId: opts.sesionId,
          metodo: opts.metodo,
          monto: opts.monto,
          cajeroId: opts.cajeroId,
          comensalNum: opts.comensalNum,
        },
      });
      const restante = toDbString(restanteActual.minus(dinero(opts.monto)));
      try {
        const { emit } = await import("@/realtime/emitter");
        emit(["caja", `sesion:${opts.sesionId}`], "pago:registrado", {
          sesionId: opts.sesionId,
          restante,
        });
      } catch (e) {
        const { logger } = await import("@/lib/logger");
        logger.warn("Emit pago:registrado falló", { err: (e as Error).message });
      }
      return pago;
    });
  },

  async resumenCuenta(sesionId: string) {
    const sesion = await prisma.sesionMesa.findUniqueOrThrow({
      where: { id: sesionId },
      include: {
        pedidos: { include: { items: { include: { producto: true, modificadores: true } } } },
        pagos: true,
      },
    });
    const total = await sesionService.calcularTotal(sesionId);
    const restante = restanteEnSesion(
      total,
      sesion.pagos.map((p) => p.monto.toString()),
    );
    return { sesion, total, restante };
  },
};
