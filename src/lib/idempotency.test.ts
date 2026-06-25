import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, type TestDb } from "../../tests/setup/db";

let db: TestDb;

describe("idempotency", () => {
  beforeAll(async () => {
    db = await startTestDb();
    process.env.DATABASE_URL = db.url;
  }, 120_000);
  afterAll(async () => {
    if (db) await db.stop();
  });

  it("misma key devuelve el primer resultado sin re-ejecutar fn", async () => {
    const { runIdempotent } = await import("./idempotency");
    let count = 0;
    const fn = async () => {
      count++;
      return { status: 201, body: { n: count } };
    };
    const a = await runIdempotent("abc-123", "test", fn);
    const b = await runIdempotent("abc-123", "test", fn);
    expect(count).toBe(1);
    expect(b).toEqual(a);
  });
});
