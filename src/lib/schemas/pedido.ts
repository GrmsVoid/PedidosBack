import { z } from "zod";

export const itemInputSchema = z.object({
  productoId: z.string().min(1),
  cantidad: z.number().int().min(1).max(50),
  opcionesIds: z.array(z.string()).default([]),
  notaLibre: z.string().max(200).nullable().default(null),
});

export const pedidoCreateSchema = z.object({
  items: z.array(itemInputSchema).min(1),
});

export const cancelarSchema = z.object({ motivo: z.string().trim().min(3).max(200) });
