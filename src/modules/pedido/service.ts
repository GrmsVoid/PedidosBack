import { prisma } from "@/lib/prisma";
import { AppError, ErrorCode } from "@/lib/errors";
import {
  validarYCalcularItem,
  type ItemCalculado,
  type ItemInput,
  type ProductoSnapshot,
} from "@/modules/catalogo/service";
import { catalogoRepo, fechaHoyUTC } from "@/modules/catalogo/repository";
import { dinero, multiplicar, toDbString } from "@/lib/dinero";
import { pedidoRepo } from "./repository";
import { puedeTransicionarPedido } from "./state";
import { PedidoEstado, PedidoOrigen, type Prisma } from "@prisma/client";

const LOCAL_ID = "demo-local";

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

    const fecha = fechaHoyUTC();
    const calculados: ItemCalculado[] = [];
    const productosUsados = new Map<string, ProductoSnapshot>(); // para revalidar disponibilidad
    const combosUsados = new Set<string>();

    for (const it of opts.items) {
      if (it.comboId) {
        const combo = await prisma.combo.findFirst({
          where: { id: it.comboId, localId: LOCAL_ID, deletedAt: null },
          include: { items: { include: { producto: true } } },
        });
        if (!combo) {
          throw new AppError(ErrorCode.NOT_FOUND, "Combo no existe", { comboId: it.comboId });
        }
        if (!combo.disponible) {
          throw new AppError(ErrorCode.PRODUCT_UNAVAILABLE, `Combo ${combo.nombre} no disponible`);
        }
        const prep = Math.max(0, ...combo.items.map((ci) => ci.producto.prepTimeMinutes));
        const precio = combo.precio.toString();
        calculados.push({
          productoId: null,
          comboId: combo.id,
          nombreCongelado: combo.nombre,
          cantidad: it.cantidad,
          precioUnitarioCongelado: precio,
          prepTimeCongelado: prep,
          notaLibre: it.notaLibre,
          estacionIdCongelada: combo.estacionId,
          modificadores: [],
          totalLinea: toDbString(multiplicar(dinero(precio), it.cantidad)),
        });
        combosUsados.add(combo.id);
        continue;
      }

      // Item de producto
      const productoId = it.productoId;
      if (!productoId) throw new AppError(ErrorCode.VALIDATION, "Item sin producto ni combo");
      let snap = productosUsados.get(productoId);
      if (!snap) {
        const p = await catalogoRepo.findProductoConModificadores(productoId);
        if (!p) {
          throw new AppError(ErrorCode.NOT_FOUND, "Producto no existe", { productoId });
        }
        // Precio del día (promo) vigente hoy, si existe.
        const especial = await prisma.precioDia.findUnique({
          where: { productoId_fecha: { productoId, fecha } },
        });
        snap = {
          id: p.id,
          nombre: p.nombre,
          precioBase: (especial?.precio ?? p.precioBase).toString(),
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
        };
        productosUsados.set(productoId, snap);
      }
      calculados.push(
        validarYCalcularItem(snap, {
          productoId,
          cantidad: it.cantidad,
          opcionesIds: it.opcionesIds,
          notaLibre: it.notaLibre,
        }),
      );
    }

    return prisma.$transaction(async (tx) => {
      const sesion = await tx.sesionMesa.findUniqueOrThrow({ where: { id: opts.sesionId } });
      if (sesion.estado !== "ABIERTA") {
        throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, "Sesión no abierta");
      }
      const numeroSesion = await pedidoRepo.siguienteNumero(opts.sesionId);

      // Revalidar disponibilidad dentro de la transacción (race condition)
      for (const [id, p] of productosUsados) {
        const fresh = await tx.producto.findUniqueOrThrow({ where: { id } });
        if (!fresh.disponible) {
          throw new AppError(ErrorCode.PRODUCT_UNAVAILABLE, `Producto ${p.nombre} agotado`, {
            productoId: id,
          });
        }
      }
      for (const id of combosUsados) {
        const fresh = await tx.combo.findUnique({ where: { id } });
        if (!fresh || fresh.deletedAt || !fresh.disponible) {
          throw new AppError(ErrorCode.PRODUCT_UNAVAILABLE, "Combo no disponible", { comboId: id });
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
              comboId: c.comboId,
              nombreCongelado: c.nombreCongelado,
              cantidad: c.cantidad,
              precioUnitarioCongelado: c.precioUnitarioCongelado,
              prepTimeCongelado: c.prepTimeCongelado,
              notaLibre: c.notaLibre,
              estacionIdCongelada: c.estacionIdCongelada,
              modificadores: { create: c.modificadores },
            })),
          },
        },
        include: { items: { include: { modificadores: true } } },
      });

      const etaSegundos = pedido.items.reduce(
        (acc, it) => Math.max(acc, it.prepTimeCongelado * 60),
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
      include: { items: true },
    });
    if (
      pedido.estado === "LISTO" ||
      pedido.estado === "ENTREGADO" ||
      pedido.estado === "CANCELADO"
    ) {
      return 0;
    }
    const estacionId = pedido.items[0]?.estacionIdCongelada;
    if (!estacionId) return 0;
    const cola = await pedidoRepo.colaPorEstacion(estacionId);
    const prepDe = (items: { prepTimeCongelado: number }[]) =>
      items.length ? Math.max(...items.map((i) => i.prepTimeCongelado)) : 0;
    const minutosCola = cola
      .filter((p) => p.confirmadoEn < pedido.confirmadoEn)
      .reduce((acc, p) => acc + prepDe(p.items), 0);
    const minutosPropio = prepDe(pedido.items);
    const transcurridoMin = pedido.preparacionIniciadaEn
      ? (Date.now() - pedido.preparacionIniciadaEn.getTime()) / 60_000
      : 0;
    return Math.max(0, Math.round((minutosCola + minutosPropio - transcurridoMin) * 60));
  },
};
