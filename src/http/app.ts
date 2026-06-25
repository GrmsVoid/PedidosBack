import express, { type Express } from "express";
import cors from "cors";
import { authRouter } from "./auth.routes";
import { menuRouter } from "./menu.routes";
import { sesionRouter } from "./sesion.routes";
import { mozoRouter } from "./mozo.routes";
import { kdsRouter } from "./kds.routes";
import { cajaRouter } from "./caja.routes";
import { adminRouter } from "./admin.routes";

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: process.env.FRONTEND_ORIGIN ?? true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "cafe-pedidos-api" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", menuRouter);
  app.use("/api", sesionRouter);
  app.use("/api", mozoRouter);
  app.use("/api", kdsRouter);
  app.use("/api", cajaRouter);
  app.use("/api", adminRouter);

  return app;
}
