import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "@/http/app";
import { assertEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { startSocketServer } from "@/realtime/server";
import { startEtaCron } from "@/realtime/eta-cron";
import { startHoldSweeper } from "@/realtime/hold-sweeper";

// Marca de arranque + captura de cualquier crash silencioso. En contenedores (Railway)
// un throw sin manejar puede dejar el log en blanco; esto lo hace siempre visible.
console.log(
  `[boot] backend iniciando · NODE_ENV=${process.env.NODE_ENV} · PORT=${process.env.PORT ?? "(sin definir → 4000)"}`,
);
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("[fatal] unhandledRejection:", err);
  process.exit(1);
});

try {
  assertEnv();

  const app = createApp();
  const port = Number(process.env.PORT ?? 4000);
  const httpServer = createServer(app);

  // Socket.IO comparte el MISMO proceso/HTTP server que la API → los emit() funcionan.
  startSocketServer(httpServer);
  startEtaCron();
  startHoldSweeper();

  httpServer.listen(port, () => {
    logger.info("API + Socket.IO escuchando", { port });
  });
} catch (err) {
  console.error("[fatal] fallo en el arranque:", err);
  process.exit(1);
}
