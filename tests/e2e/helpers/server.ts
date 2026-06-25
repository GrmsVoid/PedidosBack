import { startTestDb, type TestDb } from "../../setup/db";
import { execSync } from "node:child_process";
import supertest from "supertest";

export type E2ECtx = {
  db: TestDb;
  request: ReturnType<typeof supertest>;
  stop: () => Promise<void>;
};

export async function startE2E(): Promise<E2ECtx> {
  const db = await startTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.QR_SIGNING_SECRET = "a".repeat(64);
  process.env.AUTH_SECRET = "b".repeat(64);
  execSync("pnpm db:seed", { env: { ...process.env, DATABASE_URL: db.url }, stdio: "inherit" });

  // Importar la app DESPUÉS de fijar DATABASE_URL para que el cliente Prisma apunte al contenedor
  const { createApp } = await import("@/http/app");
  const request = supertest(createApp());

  return {
    db,
    request,
    stop: async () => {
      await db.stop();
    },
  };
}
