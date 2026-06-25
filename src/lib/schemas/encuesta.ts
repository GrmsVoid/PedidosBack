import { z } from "zod";

export const encuestaSchema = z.object({
  estrellas: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(500).optional(),
});
