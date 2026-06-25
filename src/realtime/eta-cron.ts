import { prisma } from "@/lib/prisma";
import { pedidoService } from "@/modules/pedido/service";
import { emit } from "./emitter";
import { logger } from "@/lib/logger";

const INTERVALO_MS = 30_000;
const UMBRAL_CAMBIO_SEG = 10;

const ultimaEtaEmitida = new Map<string, number>();

export function startEtaCron() {
  setInterval(async () => {
    try {
      const activos = await prisma.pedido.findMany({
        where: { estado: { in: ["CONFIRMADO", "EN_PREPARACION"] } },
        select: { id: true, sesionId: true },
      });
      for (const p of activos) {
        const eta = await pedidoService.etaSegundos(p.id);
        const anterior = ultimaEtaEmitida.get(p.id) ?? Infinity;
        if (Math.abs(eta - anterior) >= UMBRAL_CAMBIO_SEG) {
          ultimaEtaEmitida.set(p.id, eta);
          emit(`sesion:${p.sesionId}`, "eta:recalculada", { pedidoId: p.id, etaSegundos: eta });
        }
      }
    } catch (err) {
      logger.warn("eta-cron falló", { err: (err as Error).message });
    }
  }, INTERVALO_MS);
  logger.info("ETA cron iniciado", { intervaloMs: INTERVALO_MS });
}
