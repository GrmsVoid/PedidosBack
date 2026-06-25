import { z } from "zod";

export const mesaCreateSchema = z.object({
  codigo: z.string().trim().min(1).max(20),
  capacidad: z.number().int().min(1).max(20).default(4),
  posicionX: z.number().int().min(0).default(0),
  posicionY: z.number().int().min(0).default(0),
});

export const mesaUpdateSchema = mesaCreateSchema.partial();
