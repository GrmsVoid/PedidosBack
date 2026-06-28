import { Router } from "express";
import { z } from "zod";
import { requireRole } from "@/lib/authorize";
import { planillaService } from "@/modules/planilla/service";
import { AppError, ErrorCode } from "@/lib/errors";
import { route } from "./handler";

const cerrarSchema = z.object({
  anio: z.number().int().min(2000).max(2100),
  mes: z.number().int().min(1).max(12),
});

export const planillaRouter = Router();

planillaRouter.get(
  "/admin/planilla",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const now = new Date();
    const anio = Number(req.query.anio ?? now.getFullYear());
    const mes = Number(req.query.mes ?? now.getMonth() + 1);
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new AppError(ErrorCode.VALIDATION, "anio/mes inválidos");
    }
    return { body: await planillaService.preview(anio, mes) };
  }),
);

planillaRouter.post(
  "/admin/planilla/cerrar",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    const { anio, mes } = cerrarSchema.parse(req.body);
    return { status: 201, body: await planillaService.cerrar(anio, mes) };
  }),
);

planillaRouter.delete(
  "/admin/planilla/:id",
  route(async (req) => {
    await requireRole(req, ["ADMIN"]);
    return { body: await planillaService.reabrir(req.params.id) };
  }),
);
