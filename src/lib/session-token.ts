import { SignJWT, jwtVerify } from "jose";
import { AppError, ErrorCode } from "./errors";

export type SessionTokenPayload = {
  sesionId: string;
  mesaIds: string[];
  cierreEstimadoIso: string;
  tipo?: "OPERATIVO" | "ENCUESTA_POST_CIERRE";
};

function getKey(): Uint8Array {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("QR_SIGNING_SECRET no configurado o menor a 32 caracteres");
  }
  return new TextEncoder().encode(secret);
}

export async function firmarSessionToken(payload: SessionTokenPayload): Promise<string> {
  return new SignJWT({ ...payload, tipo: payload.tipo ?? "OPERATIVO" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("cafe-pedidos-sesion")
    .sign(getKey());
}

export async function verificarSessionToken(token: string): Promise<SessionTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, getKey(), { issuer: "cafe-pedidos-sesion" });
    return {
      sesionId: payload.sesionId as string,
      mesaIds: payload.mesaIds as string[],
      cierreEstimadoIso: payload.cierreEstimadoIso as string,
      tipo: (payload.tipo as "OPERATIVO" | "ENCUESTA_POST_CIERRE") ?? "OPERATIVO",
    };
  } catch {
    throw new AppError(ErrorCode.SESSION_EXPIRED, "Sesión expirada o token inválido");
  }
}
