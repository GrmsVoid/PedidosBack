import { z } from "zod";
import { cuidSchema, dineroStringSchema, nonEmptyStringSchema } from "./base";

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD inválida");

export const precioDiaUpsertSchema = z.object({
  productoId: cuidSchema,
  fecha: fechaSchema,
  precio: dineroStringSchema,
});

export const comboItemSchema = z.object({
  productoId: cuidSchema,
  cantidad: z.number().int().min(1).max(20),
});

export const comboCreateSchema = z.object({
  nombre: nonEmptyStringSchema.max(80),
  descripcion: z.string().trim().max(200).optional(),
  precio: dineroStringSchema,
  estacionId: cuidSchema.optional(),
  items: z.array(comboItemSchema).min(1),
});

export const comboUpdateSchema = z.object({
  nombre: nonEmptyStringSchema.max(80).optional(),
  descripcion: z.string().trim().max(200).nullable().optional(),
  precio: dineroStringSchema.optional(),
  disponible: z.boolean().optional(),
  estacionId: cuidSchema.optional(),
  items: z.array(comboItemSchema).min(1).optional(),
});
