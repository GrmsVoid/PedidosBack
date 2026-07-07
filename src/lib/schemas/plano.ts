import { z } from "zod";

/** Todas las medidas del plano van en centímetros (enteros o decimales cortos). */
const cm = z.number().min(0).max(20000);

const puntoSchema = z.object({ x: cm, y: cm });

const zonaSchema = z.object({
  id: z.string().min(1).max(60),
  nombre: z.string().trim().min(1).max(40),
  puntos: z.array(puntoSchema).min(3).max(60),
});

const pisoSchema = z.object({
  id: z.string().min(1).max(60),
  nombre: z.string().trim().min(1).max(30),
  ancho: z.number().min(200).max(20000),
  alto: z.number().min(200).max(20000),
  zonas: z.array(zonaSchema).max(30).default([]),
});

/** Plano del local: uno o varios pisos, cada uno con sus dimensiones y zonas. */
export const planoSchema = z.object({
  pisos: z.array(pisoSchema).min(1).max(5),
});

export const posicionesSchema = z.object({
  posiciones: z
    .array(
      z.object({
        id: z.string().min(1),
        posicionX: z.number().int().min(0).max(20000),
        posicionY: z.number().int().min(0).max(20000),
        pisoId: z.string().min(1).max(60).nullable().optional(),
      }),
    )
    .min(1)
    .max(300),
});

export type PlanoLocal = z.infer<typeof planoSchema>;
export type PlanoPiso = z.infer<typeof pisoSchema>;

/**
 * Acepta la forma antigua del planoJson ({ ancho, alto, zonas }) y la envuelve
 * como un plano de un solo piso; la forma nueva pasa tal cual.
 */
export function normalizarPlano(raw: unknown): PlanoLocal | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (Array.isArray(p.pisos)) return p as PlanoLocal;
  if (typeof p.ancho === "number" && typeof p.alto === "number") {
    return {
      pisos: [
        {
          id: "piso-1",
          nombre: "1er piso",
          ancho: p.ancho,
          alto: p.alto,
          zonas: (p.zonas as PlanoPiso["zonas"]) ?? [],
        },
      ],
    };
  }
  return null;
}
