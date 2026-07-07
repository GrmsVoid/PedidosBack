import { grupoService } from "@/modules/grupo/service";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const INTERVALO_MS = 30_000;
const PRE_PEDIDO_TTL_MS = 60 * 60 * 1000; // 1 h sin aceptación → expira

/**
 * Libera mesas cuyo "hold" (reserva de 5 min) venció sin que se hiciera un pedido,
 * y expira los pre-pedidos web que nadie aceptó en 1 hora.
 */
export function startHoldSweeper() {
  setInterval(async () => {
    try {
      const n = await grupoService.liberarHoldsExpirados();
      if (n > 0) logger.info("Holds expirados liberados", { mesas: n });
      const { count } = await prisma.pedidoRemoto.updateMany({
        where: { estado: "PENDIENTE", creadoEn: { lt: new Date(Date.now() - PRE_PEDIDO_TTL_MS) } },
        data: { estado: "EXPIRADO", resueltoEn: new Date() },
      });
      if (count > 0) logger.info("Pre-pedidos web expirados", { count });
    } catch (err) {
      logger.warn("hold-sweeper falló", { err: (err as Error).message });
    }
  }, INTERVALO_MS);
  logger.info("Hold sweeper iniciado", { intervaloMs: INTERVALO_MS });
}
