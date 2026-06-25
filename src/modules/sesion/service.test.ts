import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDb, type TestDb } from "../../../tests/setup/db";
import { execSync } from "node:child_process";

let db: TestDb;

describe("sesion.service (integración)", () => {
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

  beforeEach(async () => {
    await db.prisma.pago.deleteMany();
    await db.prisma.itemModificador.deleteMany();
    await db.prisma.itemPedido.deleteMany();
    await db.prisma.pedido.deleteMany();
    await db.prisma.eventoSesion.deleteMany();
    await db.prisma.encuesta.deleteMany();
    await db.prisma.sesionMesaMesas.deleteMany();
    await db.prisma.sesionMesa.deleteMany();
    await db.prisma.mesa.updateMany({ data: { estado: "LIBRE" } });
  });

  it("abrir mesa libre crea sesión y deja mesa OCUPADA", async () => {
    const { sesionService } = await import("./service");
    const m = await db.prisma.mesa.findFirstOrThrow();
    const sesion = await sesionService.abrirOAdjuntar("demo-local", m.id);
    expect(sesion.id).toBeDefined();
    const mActualizada = await db.prisma.mesa.findUniqueOrThrow({ where: { id: m.id } });
    expect(mActualizada.estado).toBe("OCUPADA");
  });

  it("escanear segunda vez la misma mesa devuelve la sesión existente", async () => {
    const { sesionService } = await import("./service");
    const m = await db.prisma.mesa.findFirstOrThrow();
    const s1 = await sesionService.abrirOAdjuntar("demo-local", m.id);
    const s2 = await sesionService.abrirOAdjuntar("demo-local", m.id);
    expect(s2.id).toBe(s1.id);
  });

  it("unir mesas libres crea una sola sesión con 2 mesas y ambas UNIDAS", async () => {
    const { sesionService } = await import("./service");
    const [m1, m2] = await db.prisma.mesa.findMany({ take: 2 });
    const s = await sesionService.unirMesas("demo-local", [m1.id, m2.id]);
    expect(s.mesas.length).toBe(2);
    const refresh = await db.prisma.mesa.findMany({ where: { id: { in: [m1.id, m2.id] } } });
    expect(refresh.every((x) => x.estado === "UNIDA")).toBe(true);
  });

  it("rechaza unir si una mesa no está libre", async () => {
    const { sesionService } = await import("./service");
    const { AppError } = await import("@/lib/errors");
    const [m1, m2] = await db.prisma.mesa.findMany({ take: 2 });
    await sesionService.abrirOAdjuntar("demo-local", m1.id);
    await expect(sesionService.unirMesas("demo-local", [m1.id, m2.id])).rejects.toThrowError(
      AppError,
    );
  });
});
