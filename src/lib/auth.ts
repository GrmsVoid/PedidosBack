import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { RolCodigo } from "@prisma/client";
import { AppError, ErrorCode } from "./errors";

function key(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET no configurado (mín. 32 caracteres)");
  }
  return new TextEncoder().encode(secret);
}

export async function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifySecret(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type StaffClaims = { userId: string; name: string; roles: RolCodigo[] };

export async function signStaffToken(claims: StaffClaims): Promise<string> {
  return new SignJWT({ name: claims.name, roles: claims.roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setIssuer("cafe-staff")
    .setExpirationTime("12h")
    .sign(key());
}

export async function verifyStaffToken(token: string): Promise<StaffClaims> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "cafe-staff" });
    return {
      userId: payload.sub as string,
      name: (payload.name as string) ?? "",
      roles: (payload.roles as RolCodigo[]) ?? [],
    };
  } catch {
    throw new AppError(ErrorCode.SESSION_EXPIRED, "Sesión de staff inválida o expirada");
  }
}
