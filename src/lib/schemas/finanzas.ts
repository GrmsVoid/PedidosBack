import { z } from "zod";
import { cuidSchema, dineroStringSchema, nonEmptyStringSchema } from "./base";

export const categoriaFinanzaCreateSchema = z.object({
  nombre: nonEmptyStringSchema.max(60),
  orden: z.number().int().min(0).optional(),
});

export const egresoCreateSchema = z.object({
  categoriaId: cuidSchema,
  monto: dineroStringSchema,
  fecha: z.string().datetime(),
  descripcion: z.string().trim().max(280).optional(),
});

export const egresoUpdateSchema = z.object({
  categoriaId: cuidSchema.optional(),
  monto: dineroStringSchema.optional(),
  fecha: z.string().datetime().optional(),
  descripcion: z.string().trim().max(280).nullable().optional(),
});

// Los ingresos extra tienen la misma forma que los egresos.
export const ingresoCreateSchema = egresoCreateSchema;
export const ingresoUpdateSchema = egresoUpdateSchema;

export const presupuestoUpsertSchema = z.object({
  categoriaId: cuidSchema,
  anio: z.number().int().min(2000).max(2100),
  mes: z.number().int().min(1).max(12),
  montoLimite: dineroStringSchema,
});
