import { prisma } from "@/lib/prisma";
import { AppError, ErrorCode } from "@/lib/errors";
import {
  validarYCalcularItem,
  type ItemInput,
  type ProductoSnapshot,
} from "@/modules/catalogo/service";
import { catalogoRepo } from "@/modules/catalogo/repository";
import { pedidoRepo } from "./repository";
import { puedeTransicionarPedido } from "./state";
import { PedidoEstado, PedidoOrigen, type Prisma } from "@prisma/client";

export const pedidoService = {
  async crear(opts: {
    sesionId: string;
    origen: PedidoOrigen;
    creadoPor: string | null;
    items: ItemInput[];
  }) {
    if (opts.items.length === 0) {
      throw new AppError(ErrorCode.VALIDATION, "Pedido sin items");
    }

    // 1) Cargar y snapshot de productos (fuera de transacción para no bloquear catálogo)
    const productos = new Map<string, ProductoSnapshot>();
    for (const it of opts.items) {
      if (productos.has(it.productoId)) continue;
      const p = await catalogoRepo.findProductoConModificadores(it.productoId);
      if (!p) {
        throw new AppError(ErrorCode.NOT_FOUND, "Producto no existe", {
          productoId: it.productoId,
        });
      }
      productos.set(it.productoId, {
        id: p.id,
        nombre: p.nombre,
        precioBase: p.precioBase.toString(),
        disponible: p.disponible,
        estacionId: p.estacionId,
        prepTimeMinutes: p.prepTimeMinutes,
        grupos: p.grupos.map((g) => ({
          id: g.id,
          nombre: g.nombre,
          obligatorio: g.obligatorio,
          minSeleccion: g.minSeleccion,
          maxSeleccion: g.maxSeleccion,
          opciones: g.opciones.map((o) => ({
            id: o.id,
            nombre: o.nombre,
            deltaPrecio: o.deltaPrecio.toString(),
            disponible: o.disponible,
          })),
        })),
      });
    }

    const calculados = opts.items.map((it) =>
      validarYCalcularItem(productos.get(it.productoId)!, it),
    );

    return prisma.$transaction(async (tx) => {
      const sesion = await tx.sesionMesa.findUniqueOrThrow({ where: { id: opts.sesionId } });
      if (sesion.estado !== "ABIERTA") {
        throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, "Sesión no abierta");
      }
      const numeroSesion = await pedidoRepo.siguienteNumero(opts.sesionId);

      // Revalidar disponibilidad dentro de la transacción (race condition)
      for (const [id, p] of productos) {
        const fresh = await tx.producto.findUniqueOrThrow({ where: { id } });
        if (!fresh.disponible) {
          throw new AppError(ErrorCode.PRODUCT_UNAVAILABLE, `Producto ${p.nombre} agotado`, {
            productoId: id,
          });
        }
      }

      const pedido = await tx.pedido.create({
        data: {
          sesionId: opts.sesionId,
          numeroSesion,
          origen: opts.origen,
          creadoPor: opts.creadoPor,
          estado: PedidoEstado.CONFIRMADO,
          items: {
            create: calculados.map((c) => ({
              productoId: c.productoId,
              cantidad: c.cantidad,
              precioUnitarioCongelado: c.precioUnitarioCongelado,
              notaLibre: c.notaLibre,
              estacionIdCongelada: c.estacionIdCongelada,
              modificadores: { create: c.modificadores },
            })),
          },
        },
        include: { items: { include: { modificadores: true } } },
      });

      // Emisión post-creación (best-effort; Socket.IO puede no estar arriba)
      const etaSegundos = pedido.items.reduce(
        (acc, it) => Math.max(acc, productos.get(it.productoId)!.prepTimeMinutes * 60),
        0,
      );
      try {
        const { emit } = await import("@/realtime/emitter");
        emit(["kds", `sesion:${opts.sesionId}`], "pedido:creado", {
          pedidoId: pedido.id,
          sesionId: opts.sesionId,
          etaSegundos,
        });
      } catch (e) {
        const { logger } = await import("@/lib/logger");
        logger.warn("Emit pedido:creado falló", { err: (e as Error).message });
      }

      return pedido;
    });
  },

  async transicionar(
    pedidoId: string,
    nuevo: PedidoEstado,
    opts?: { motivo?: string; actor?: string },
  ) {
    return prisma.$transaction(async (tx) => {
      const p = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
      if (!puedeTransicionarPedido(p.estado, nuevo)) {
        throw new AppError(
          ErrorCode.INVALID_STATE_TRANSITION,
          `No se puede ${p.estado} → ${nuevo}`,
        );
      }
      const ahora = new Date();
      const data: Prisma.PedidoUpdateInput = { estado: nuevo };
      if (nuevo === "EN_PREPARACION") data.preparacionIniciadaEn = ahora;
      if (nuevo === "LISTO") data.listoEn = ahora;
      if (nuevo === "ENTREGADO") data.entregadoEn = ahora;
      if (nuevo === "CANCELADO") {
        data.canceladoEn = ahora;
        data.canceladoMotivo = opts?.motivo ?? "Sin motivo";
        await tx.eventoSesion.create({
          data: {
            sesionId: p.sesionId,
            tipo: "PEDIDO_CANCELADO",
            payloadJson: { pedidoId, motivo: opts?.motivo },
            actorUsuarioId: opts?.actor,
          },
        });
      }
      const actualizado = await tx.pedido.update({ where: { id: pedidoId }, data });
      try {
        const { emit } = await import("@/realtime/emitter");
        if (nuevo === "CANCELADO") {
          emit([`sesion:${p.sesionId}`, "kds", "mozos"], "pedido:cancelado", {
            pedidoId,
            motivo: opts?.motivo ?? "Sin motivo",
          });
        } else {
          // ETA aproximada inmediata; el recálculo periódico la refina.
          emit([`sesion:${p.sesionId}`, "kds", "mozos"], "pedido:estado", {
            pedidoId,
            estado: nuevo,
            etaSegundos: 0,
          });
        }
      } catch (e) {
        const { logger } = await import("@/lib/logger");
        logger.warn("Emit pedido:estado falló", { err: (e as Error).message });
      }
      return actualizado;
    });
  },

  /** ETA en segundos para un pedido dado, basado en la cola de su estación. */
  async etaSegundos(pedidoId: string): Promise<number> {
    const pedido = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
      include: { items: { include: { producto: true } } },
    });
    if (
      pedido.estado === "LISTO" ||
      pedido.estado === "ENTREGADO" ||
      pedido.estado === "CANCELADO"
    ) {
      return 0;
    }
    // Por simplicidad asumimos una sola estación por pedido (la del primer item)
    const estacionId = pedido.items[0]?.estacionIdCongelada;
    if (!estacionId) return 0;
    const cola = await pedidoRepo.colaPorEstacion(estacionId);
    const minutosCola = cola
      .filter((p) => p.confirmadoEn < pedido.confirmadoEn)
      .reduce((acc, p) => acc + Math.max(...p.items.map((i) => i.producto.prepTimeMinutes)), 0);
    const minutosPropio = Math.max(...pedido.items.map((i) => i.producto.prepTimeMinutes));
    const transcurridoMin = pedido.preparacionIniciadaEn
      ? (Date.now() - pedido.preparacionIniciadaEn.getTime()) / 60_000
      : 0;
    return Math.max(0, Math.round((minutosCola + minutosPropio - transcurridoMin) * 60));
  },
};
