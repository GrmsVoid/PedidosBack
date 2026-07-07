import { SignJWT, jwtVerify } from "jose";
import { AppError, ErrorCode } from "./errors";

export type ParticipanteTokenPayload = {
  sesionId: string;
  participanteId: string;
};

function getKey(): Uint8Array {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("QR_SIGNING_SECRET no configurado o menor a 32 caracteres");
  }
  return new TextEncoder().encode(secret);
}

export async function firmarParticipanteToken(p: ParticipanteTokenPayload): Promise<string> {
  return new SignJWT({ ...p, tipo: "PARTICIPANTE" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("cafe-pedidos-grupo")
    .sign(getKey());
}

export async function verificarParticipanteToken(
  token: string,
): Promise<ParticipanteTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, getKey(), { issuer: "cafe-pedidos-grupo" });
    return {
      sesionId: payload.sesionId as string,
      participanteId: payload.participanteId as string,
    };
  } catch {
    throw new AppError(ErrorCode.SESSION_EXPIRED, "Sesión de grupo inválida o expirada");
  }
}
