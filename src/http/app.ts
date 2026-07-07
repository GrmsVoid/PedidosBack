import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authRouter } from "./auth.routes";
import { menuRouter } from "./menu.routes";
import { sesionRouter } from "./sesion.routes";
import { grupoRouter } from "./grupo.routes";
import { mozoRouter } from "./mozo.routes";
import { kdsRouter } from "./kds.routes";
import { cajaRouter } from "./caja.routes";
import { adminRouter } from "./admin.routes";
import { finanzasRouter } from "./finanzas.routes";
import { personalRouter } from "./personal.routes";
import { planillaRouter } from "./planilla.routes";
import { menudiaRouter } from "./menudia.routes";
import { publicoRouter } from "./publico.routes";

/** Orígenes permitidos: FRONTEND_ORIGIN (coma-separado). En dev cae a localhost:3000. */
export function allowedOrigins(): string[] {
  const raw = process.env.FRONTEND_ORIGIN;
  if (raw) return raw.split(",").map((o) => o.trim()).filter(Boolean);
  return ["http://localhost:3000"];
}

export function createApp(): Express {
  const app = express();

  // Detrás de un proxy (Railway/nginx) el rate limit debe ver la IP real.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Headers de seguridad. La API solo sirve JSON: CSP restrictiva no rompe nada.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );

  app.use(
    cors({
      origin: allowedOrigins(),
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "256kb" }));

  // Límite global generoso (las pantallas de staff hacen polling cada 2–5 s).
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes; espera un momento." } },
    }),
  );

  // Anti fuerza bruta en login: cuenta solo los intentos fallidos por IP.
  app.use(
    "/api/auth/login",
    rateLimit({
      windowMs: 10 * 60_000,
      limit: 10,
      skipSuccessfulRequests: true,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: {
        error: { code: "RATE_LIMITED", message: "Demasiados intentos de acceso. Intenta en 10 minutos." },
      },
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "cafe-pedidos-api" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", menuRouter);
  app.use("/api", sesionRouter);
  app.use("/api", grupoRouter);
  app.use("/api", mozoRouter);
  app.use("/api", kdsRouter);
  app.use("/api", cajaRouter);
  app.use("/api", adminRouter);
  app.use("/api", finanzasRouter);
  app.use("/api", personalRouter);
  app.use("/api", planillaRouter);
  app.use("/api", menudiaRouter);
  app.use("/api", publicoRouter);

  return app;
}
