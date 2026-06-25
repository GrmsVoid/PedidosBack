import type { Request } from "express";
import { AppError, ErrorCode } from "./errors";
import { verifyStaffToken } from "./auth";
import type { RolCodigo } from "@prisma/client";

export function hasAnyRole(userRoles: RolCodigo[], required: RolCodigo[]): boolean {
  return userRoles.some((r) => required.includes(r));
}

/** Extrae el token "Bearer <jwt>" del header Authorization. */
export function bearer(req: Request): string | null {
  const h = req.header("authorization");
  if (!h) return null;
  const [scheme, token] = h.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

/** Verifica el JWT de staff y exige uno de los roles. Lanza AppError si falla. */
export async function requireRole(
  req: Request,
  required: RolCodigo[],
): Promise<{ userId: string; roles: RolCodigo[] }> {
  const token = bearer(req);
  if (!token) throw new AppError(ErrorCode.SESSION_EXPIRED, "No autenticado");
  const claims = await verifyStaffToken(token);
  if (!hasAnyRole(claims.roles, required)) {
    throw new AppError(ErrorCode.FORBIDDEN_ROLE, "Rol insuficiente", { required });
  }
  return { userId: claims.userId, roles: claims.roles };
}
