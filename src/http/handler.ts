import type { Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, ErrorCode, toHttpResponse } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type RouteFn = (req: Request) => Promise<{ status?: number; body: unknown }>;

/** Envuelve un handler: serializa la respuesta y mapea AppError / ZodError a HTTP. */
export function route(fn: RouteFn) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, body } = await fn(req);
      res.status(status ?? 200).json(body);
    } catch (err) {
      if (err instanceof AppError) {
        const { status, body } = toHttpResponse(err);
        res.status(status).json(body);
        return;
      }
      if (err instanceof ZodError) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION,
            message: "Datos inválidos",
            details: err.flatten(),
          },
        });
        return;
      }
      logger.error("Error inesperado en API", {
        err: (err as Error).message,
        stack: (err as Error).stack,
      });
      res.status(500).json({ error: { code: "INTERNAL", message: "Error interno" } });
    }
  };
}
