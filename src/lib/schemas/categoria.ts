import { z } from "zod";

export const categoriaCreateSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  orden: z.number().int().min(0).default(0),
});

export const categoriaUpdateSchema = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  orden: z.number().int().min(0).optional(),
  activa: z.boolean().optional(),
});

export type CategoriaCreateInput = z.infer<typeof categoriaCreateSchema>;
export type CategoriaUpdateInput = z.infer<typeof categoriaUpdateSchema>;
