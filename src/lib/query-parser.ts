import { z } from "zod";

const rangoSchema = z.object({
  desde: z.string().datetime(),
  hasta: z.string().datetime(),
});

export function parseRango(url: string): { desde: Date; hasta: Date } {
  const u = new URL(url);
  const r = rangoSchema.parse({
    desde: u.searchParams.get("desde") ?? new Date(Date.now() - 24 * 3600_000).toISOString(),
    hasta: u.searchParams.get("hasta") ?? new Date().toISOString(),
  });
  return { desde: new Date(r.desde), hasta: new Date(r.hasta) };
}
