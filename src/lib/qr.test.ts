import { describe, it, expect, beforeAll } from "vitest";
import { firmarTokenMesa, verificarTokenMesa } from "./qr";
import { AppError, ErrorCode } from "./errors";

beforeAll(() => {
  process.env.QR_SIGNING_SECRET = "a".repeat(64);
});

describe("qr", () => {
  it("firma y verifica un token con mesaId y localId", async () => {
    const tok = await firmarTokenMesa({ mesaId: "m1", localId: "L", keyId: "v1" });
    const payload = await verificarTokenMesa(tok);
    expect(payload.mesaId).toBe("m1");
    expect(payload.localId).toBe("L");
    expect(payload.keyId).toBe("v1");
  });

  it("rechaza tokens con firma corrupta", async () => {
    const tok = await firmarTokenMesa({ mesaId: "m1", localId: "L", keyId: "v1" });
    const corrupto = tok.slice(0, -3) + "xxx";
    await expect(verificarTokenMesa(corrupto)).rejects.toThrowError(AppError);
    try {
      await verificarTokenMesa(corrupto);
    } catch (e) {
      expect((e as AppError).code).toBe(ErrorCode.INVALID_QR_TOKEN);
    }
  });
});
