import Decimal from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type Dinero = Decimal;

export function dinero(valor: string | number | Decimal): Dinero {
  return new Decimal(valor);
}

export function sumar(...valores: Dinero[]): Dinero {
  return valores.reduce((acc, v) => acc.plus(v), new Decimal(0));
}

export function multiplicar(monto: Dinero, factor: number | string): Dinero {
  return monto.times(factor);
}

export function dividir(monto: Dinero, divisor: number): Dinero {
  return monto.div(divisor);
}

export function esIgual(a: Dinero, b: Dinero): boolean {
  return a.eq(b);
}

export function esMayorOIgual(a: Dinero, b: Dinero): boolean {
  return a.gte(b);
}

export function formatear(monto: Dinero): string {
  return `S/ ${monto.toFixed(2)}`;
}

export function fromString(s: string | null | undefined): Dinero {
  if (!s) return new Decimal(0);
  return new Decimal(s);
}

export function toDbString(monto: Dinero): string {
  return monto.toFixed(2);
}
