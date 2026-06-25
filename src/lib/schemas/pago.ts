import { z } from "zod";
import { dineroStringSchema } from "./base";

export const pagoCreateSchema = z.object({
  metodo: z.enum(["EFECTIVO", "YAPE", "POS"]),
  monto: dineroStringSchema,
  comensalNum: z.number().int().positive().nullable().default(null),
});

export const cerrarSinPagoSchema = z.object({
  motivo: z.string().trim().min(3).max(200),
});
