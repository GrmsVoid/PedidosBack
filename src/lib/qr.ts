import { SignJWT, jwtVerify } from "jose";
import { AppError, ErrorCode } from "./errors";

export type TokenMesaPayload = {
  mesaId: string;
  localId: string;
  keyId: string;
};

function getKey(): Uint8Array {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("QR_SIGNING_SECRET no configurado o menor a 32 caracteres");
  }
  return new TextEncoder().encode(secret);
}

export async function firmarTokenMesa(payload: TokenMesaPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", kid: payload.keyId })
    .setIssuedAt()
    .setIssuer("cafe-pedidos")
    .sign(getKey());
}

export async function verificarTokenMesa(token: string): Promise<TokenMesaPayload> {
  try {
    const { payload } = await jwtVerify(token, getKey(), { issuer: "cafe-pedidos" });
    if (
      typeof payload.mesaId !== "string" ||
      typeof payload.localId !== "string" ||
      typeof payload.keyId !== "string"
    ) {
      throw new Error("Payload incompleto");
    }
    return {
      mesaId: payload.mesaId,
      localId: payload.localId,
      keyId: payload.keyId,
    };
  } catch {
    throw new AppError(ErrorCode.INVALID_QR_TOKEN, "Token de QR inválido o firma cambiada");
  }
}
