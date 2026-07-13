import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/** Tipo real de la función emit() del emitter (importada de forma diferida). */
type EmitFn = (typeof import("@/realtime/emitter"))["emit"];

/** Callback diferido: recibe emit() ya resuelto y ejecuta uno o varios emits. */
type Deferred = (emit: EmitFn) => void;

export interface TxContext {
  tx: Prisma.TransactionClient;
  /**
   * Encola un emit de realtime para lanzarlo DESPUÉS del commit. Si la
   * transacción se revierte, el callback nunca corre → sin eventos fantasma.
   */
  emitAfter(fn: Deferred): void;
}

/**
 * Ejecuta `work` dentro de una transacción y difiere los emits de Socket.IO
 * hasta después del commit.
 *
 * Por qué: emitir dentro de la transacción avisa a los clientes de un estado
 * que aún no está confirmado; si el commit falla (deadlock, caída de conexión)
 * quedan eventos "fantasma". Difiriendo, los eventos solo salen si la tx
 * realmente se persistió. Los emits son best-effort: un fallo al emitir se
 * registra pero no revierte nada (el dato ya está guardado).
 */
export async function withTransaction<T>(
  work: (ctx: TxContext) => Promise<T>,
  opts?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  const deferred: Deferred[] = [];
  const result = await prisma.$transaction(
    (tx) => work({ tx, emitAfter: (fn) => deferred.push(fn) }),
    opts,
  );

  if (deferred.length > 0) {
    try {
      const { emit } = await import("@/realtime/emitter");
      for (const fn of deferred) {
        try {
          fn(emit);
        } catch (e) {
          logger.warn("Emit diferido falló", { err: (e as Error).message });
        }
      }
    } catch (e) {
      // Socket.IO puede no estar arriba (p. ej. en tests): no es fatal.
      logger.warn("No se pudo cargar el emitter para emits diferidos", {
        err: (e as Error).message,
      });
    }
  }

  return result;
}

/** true si `e` es una violación de índice único (P2002) de Prisma. */
export function esConflictoUnico(e: unknown, target?: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
    return false;
  }
  if (!target) return true;
  const meta = e.meta?.target;
  const targets = Array.isArray(meta) ? meta.map(String) : [String(meta ?? "")];
  return targets.some((t) => t.includes(target));
}

/**
 * Reintenta `fn` cuando choca con un índice único (carreras de numeración,
 * doble-inserción por concurrencia, etc.). `fn` debe ser idempotente: cada
 * reintento recalcula el número/estado a partir del dato ya persistido.
 */
export async function conReintentoConflicto<T>(
  fn: () => Promise<T>,
  opts?: { intentos?: number; target?: string },
): Promise<T> {
  const intentos = opts?.intentos ?? 3;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i < intentos - 1 && esConflictoUnico(e, opts?.target)) continue;
      throw e;
    }
  }
}
