import { describe, it, expect } from "vitest";
import { AppError, ErrorCode, toHttpResponse } from "./errors";

describe("AppError", () => {
  it("mapea TABLE_BUSY a HTTP 409", () => {
    const err = new AppError(ErrorCode.TABLE_BUSY, "Mesa ocupada", { mesaId: 5 });
    const res = toHttpResponse(err);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TABLE_BUSY");
    expect(res.body.error.details).toEqual({ mesaId: 5 });
  });

  it("mapea INVALID_QR_TOKEN a HTTP 401", () => {
    const err = new AppError(ErrorCode.INVALID_QR_TOKEN, "Token inválido");
    expect(toHttpResponse(err).status).toBe(401);
  });

  it("mapea PAYMENT_INCOMPLETE a HTTP 409", () => {
    const err = new AppError(ErrorCode.PAYMENT_INCOMPLETE, "Falta cobrar", { restante: "5.00" });
    expect(toHttpResponse(err).status).toBe(409);
  });

  it("mapea MODIFIER_REQUIRED_MISSING a HTTP 422", () => {
    const err = new AppError(ErrorCode.MODIFIER_REQUIRED_MISSING, "Falta tamaño");
    expect(toHttpResponse(err).status).toBe(422);
  });
});
