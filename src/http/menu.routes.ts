import { Router } from "express";
import { catalogoRepo } from "@/modules/catalogo/repository";
import { AppError, ErrorCode } from "@/lib/errors";
import { route } from "./handler";

const DEMO_LOCAL_ID = "demo-local";

export const menuRouter = Router();

menuRouter.get(
  "/menu",
  route(async () => {
    const menu = await catalogoRepo.getMenu(DEMO_LOCAL_ID);
    if (menu.categorias.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, "Menú vacío", { localId: DEMO_LOCAL_ID });
    }
    return { body: menu };
  }),
);
