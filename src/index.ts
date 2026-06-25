import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "@/http/app";
import { logger } from "@/lib/logger";
import { startSocketServer } from "@/realtime/server";
import { startEtaCron } from "@/realtime/eta-cron";

const app = createApp();
const port = Number(process.env.PORT ?? 4000);
const httpServer = createServer(app);

// Socket.IO comparte el MISMO proceso/HTTP server que la API → los emit() funcionan.
startSocketServer(httpServer);
startEtaCron();

httpServer.listen(port, () => {
  logger.info("API + Socket.IO escuchando", { port });
});
