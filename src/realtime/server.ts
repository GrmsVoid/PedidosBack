import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import type { ServerToClientEvents, RoomName } from "./events";
import { logger } from "@/lib/logger";
import { verificarSessionToken } from "@/lib/session-token";
import { verifyStaffToken } from "@/lib/auth";

type ClientToServer = {
  join: (room: RoomName, ack?: (ok: boolean) => void) => void;
};

let io: Server<ClientToServer, ServerToClientEvents> | null = null;

export function getIo(): Server<ClientToServer, ServerToClientEvents> {
  if (!io) throw new Error("Socket.IO no inicializado");
  return io;
}

export function startSocketServer(httpServer: HttpServer) {
  io = new Server<ClientToServer, ServerToClientEvents>(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    logger.info("socket conectado", { id: socket.id });

    socket.on("join", async (room: RoomName, ack?: (ok: boolean) => void) => {
      try {
        // Clientes (room mesa:* / sesion:*) deben presentar sessionToken
        if (room.startsWith("mesa:") || room.startsWith("sesion:")) {
          const token = socket.handshake.auth?.sessionToken as string | undefined;
          if (!token) {
            ack?.(false);
            return;
          }
          const payload = await verificarSessionToken(token);
          const sesionId = room.startsWith("sesion:") ? room.split(":")[1] : null;
          if (sesionId && payload.sesionId !== sesionId) {
            ack?.(false);
            return;
          }
        }
        // Rooms internas (kds, mozos, caja, admin) requieren JWT de staff válido
        if (["kds", "mozos", "caja", "admin"].includes(room) || room.startsWith("kds:")) {
          const staffToken = socket.handshake.auth?.staffToken as string | undefined;
          if (!staffToken) {
            ack?.(false);
            return;
          }
          await verifyStaffToken(staffToken); // lanza si es inválido
        }
        await socket.join(room);
        ack?.(true);
      } catch (err) {
        logger.warn("join falló", { room, err: (err as Error).message });
        ack?.(false);
      }
    });
  });

  logger.info("Socket.IO inicializado");
}
