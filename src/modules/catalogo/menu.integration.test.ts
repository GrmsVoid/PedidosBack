import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, type TestDb } from "../../../tests/setup/db";
import { execSync } from "node:child_process";

let db: TestDb;

describe("catalogo.getMenu (integración)", () => {
  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
    execSync("pnpm db:seed", {
      env: { ...process.env, DATABASE_URL: db.url },
      stdio: "inherit",
    });
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  it("devuelve el menú seed con cappuccino y brownie", async () => {
    const { catalogoRepo } = await import("./repository");
    const menu = await catalogoRepo.getMenu("demo-local");
    expect(menu.categorias.length).toBeGreaterThanOrEqual(2);
    const cafe = menu.categorias.find((c) => c.nombre === "Café");
    expect(cafe).toBeDefined();
    const cappu = cafe?.productos.find((p) => p.nombre === "Cappuccino");
    expect(cappu).toBeDefined();
    expect(cappu?.grupos.length).toBe(3);
  });
});
