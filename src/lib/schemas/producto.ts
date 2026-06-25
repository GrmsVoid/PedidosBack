import { z } from "zod";
import { dineroStringSchema } from "./base";

export const opcionSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  deltaPrecio: dineroStringSchema.default("0.00"),
  disponible: z.boolean().default(true),
  orden: z.number().int().min(0).default(0),
});

export const grupoSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  obligatorio: z.boolean().default(false),
  minSeleccion: z.number().int().min(0).default(0),
  maxSeleccion: z.number().int().min(1).default(1),
  orden: z.number().int().min(0).default(0),
  opciones: z.array(opcionSchema).min(1),
});

export const productoCreateSchema = z.object({
  categoriaId: z.string().min(1),
  estacionId: z.string().min(1),
  nombre: z.string().trim().min(1).max(120),
  descripcion: z.string().max(500).optional(),
  imagenUrl: z.string().url().optional(),
  precioBase: dineroStringSchema,
  prepTimeMinutes: z.number().int().min(1).max(60).default(5),
  disponible: z.boolean().default(true),
  orden: z.number().int().min(0).default(0),
  grupos: z.array(grupoSchema).default([]),
});

export const productoUpdateSchema = productoCreateSchema.partial().omit({ grupos: true });

export type ProductoCreateInput = z.infer<typeof productoCreateSchema>;
export type ProductoUpdateInput = z.infer<typeof productoUpdateSchema>;
