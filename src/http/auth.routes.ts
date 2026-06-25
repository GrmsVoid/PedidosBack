import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifySecret, signStaffToken } from "@/lib/auth";
import { AppError, ErrorCode } from "@/lib/errors";
import { route } from "./handler";

const loginSchema = z.object({
  email: z.string().email(),
  secret: z.string().min(1),
});

export const authRouter = Router();

authRouter.post(
  "/login",
  route(async (req) => {
    const { email, secret } = loginSchema.parse(req.body);
    const user = await prisma.usuario.findUnique({
      where: { email },
      include: { roles: { include: { rol: true } } },
    });
    const hash = user?.passwordHash ?? user?.pinHash ?? null;
    if (!user || !user.activo || user.deletedAt || !hash || !(await verifySecret(secret, hash))) {
      throw new AppError(ErrorCode.SESSION_EXPIRED, "Credenciales inválidas");
    }
    const roles = user.roles.map((ur) => ur.rol.codigo);
    const token = await signStaffToken({ userId: user.id, name: user.nombre, roles });
    return {
      body: { token, user: { id: user.id, name: user.nombre, email: user.email, roles } },
    };
  }),
);
