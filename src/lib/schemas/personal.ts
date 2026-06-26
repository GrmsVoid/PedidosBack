import { z } from "zod";
import { cuidSchema, dineroStringSchema, nonEmptyStringSchema } from "./base";

export const rolCodigoSchema = z.enum(["MOZO", "BARISTA", "CAJERO", "ADMIN"]);
export const tipoRemuneracionSchema = z.enum(["FIJO_MENSUAL", "POR_HORA", "POR_TURNO"]);

export const usuarioCreateSchema = z.object({
  email: z.string().email(),
  nombre: nonEmptyStringSchema.max(80),
  secret: z.string().min(4).max(72),
  roles: z.array(rolCodigoSchema).min(1),
  telefono: z.string().trim().max(30).optional(),
  tipoRemuneracion: tipoRemuneracionSchema.default("FIJO_MENSUAL"),
  sueldoMensual: dineroStringSchema.optional(),
  tarifaHora: dineroStringSchema.optional(),
  montoTurno: dineroStringSchema.optional(),
});

export const usuarioUpdateSchema = z.object({
  nombre: nonEmptyStringSchema.max(80).optional(),
  secret: z.string().min(4).max(72).optional(),
  roles: z.array(rolCodigoSchema).min(1).optional(),
  activo: z.boolean().optional(),
  telefono: z.string().trim().max(30).nullable().optional(),
  tipoRemuneracion: tipoRemuneracionSchema.optional(),
  sueldoMensual: dineroStringSchema.nullable().optional(),
  tarifaHora: dineroStringSchema.nullable().optional(),
  montoTurno: dineroStringSchema.nullable().optional(),
});

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:mm inválida");
const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Fecha YYYY-MM-DD inválida");

export const turnoCreateSchema = z.object({
  usuarioId: cuidSchema,
  fecha: fechaSchema,
  horaInicio: horaSchema,
  horaFin: horaSchema,
  nota: z.string().trim().max(140).optional(),
});

export const turnoUpdateSchema = z.object({
  fecha: fechaSchema.optional(),
  horaInicio: horaSchema.optional(),
  horaFin: horaSchema.optional(),
  nota: z.string().trim().max(140).nullable().optional(),
});
