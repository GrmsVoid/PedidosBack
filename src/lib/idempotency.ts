import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

const TTL_HOURS = 24;

export type RouteResult = { status: number; body: unknown };

/**
 * Ejecuta `fn` con deduplicación por Idempotency-Key. Si la key ya tiene
 * respuesta guardada y vigente, la devuelve sin ejecutar `fn`.
 */
export async function runIdempotent(
  key: string | null,
  endpoint: string,
  fn: () => Promise<RouteResult>,
): Promise<RouteResult> {
  if (!key) return fn();

  const existente = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (existente && existente.expiraEn > new Date()) {
    return { status: existente.responseStatus, body: existente.responseBody };
  }

  const { status, body } = await fn();
  const responseBody = body as Prisma.InputJsonValue;
  const expiraEn = new Date(Date.now() + TTL_HOURS * 3600_000);
  await prisma.idempotencyKey.upsert({
    where: { key },
    create: { key, endpoint, responseStatus: status, responseBody, expiraEn },
    update: { responseStatus: status, responseBody, expiraEn },
  });
  return { status, body };
}
