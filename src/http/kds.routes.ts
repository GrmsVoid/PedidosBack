import { Router } from "express";
import { z } from "zod";
import { requireRole } from "@/lib/authorize";
import { pedidoRepo } from "@/modules/pedido/repository";
import { pedidoService } from "@/modules/pedido/service";
import { catalogoRepo } from "@/modules/catalogo/repository";
import { route } from "./handler";

const DEMO_ESTACION_ID = "demo-barra";
const dispoSchema = z.object({ disponible: z.boolean() });

export const kdsRouter = Router();

kdsRouter.get(
  "/kds/cola",
  route(async (req) => {
    await requireRole(req, ["BARISTA"]);
    const estacionId = (req.query.estacionId as string) ?? DEMO_ESTACION_ID;
    const pedidos = await pedidoRepo.colaPorEstacion(estacionId);
    const conEta = await Promise.all(
      pedidos.map(async (p) => ({ ...p, etaSegundos: await pedidoService.etaSegundos(p.id) })),
    );
    return { body: { pedidos: conEta } };
  }),
);

kdsRouter.patch(
  "/kds/pedido/:id/tomar",
  route(async (req) => {
    await requireRole(req, ["BARISTA"]);
    return { body: await pedidoService.transicionar(req.params.id, "EN_PREPARACION") };
  }),
);

kdsRouter.patch(
  "/kds/pedido/:id/listo",
  route(async (req) => {
    await requireRole(req, ["BARISTA"]);
    return { body: await pedidoService.transicionar(req.params.id, "LISTO") };
  }),
);

kdsRouter.patch(
  "/kds/producto/:id/disponibilidad",
  route(async (req) => {
    await requireRole(req, ["BARISTA"]);
    const { disponible } = dispoSchema.parse(req.body);
    await catalogoRepo.setDisponibilidad(req.params.id, disponible);
    return { body: { ok: true, productoId: req.params.id, disponible } };
  }),
);
