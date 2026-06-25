import { z } from "zod";

export const cuidSchema = z.string().min(1).max(40);
export const dineroStringSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Monto inválido (use 12.34)");
export const positiveIntSchema = z.number().int().positive();
export const nonEmptyStringSchema = z.string().trim().min(1);

export const idempotencyKeySchema = z.string().uuid().or(z.string().min(8).max(64));

export const paginacionSchema = z.object({
  cursor: cuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
