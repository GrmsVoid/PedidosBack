import { prisma } from "@/lib/prisma";
import { AppError, ErrorCode } from "@/lib/errors";
import {
  validarYCalcularItem,
  type ItemCalculado,
  type ItemInput,
  type ProductoSnapshot,
} from "@/modules/catalogo/service";
import { fechaHoyUTC } from "@/modules/catalogo/repository";
import { dinero, multiplicar, toDbString } from "@/lib/dinero";
import { conReintentoConflicto, withTransaction } from "@/lib/tx";
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

    // --- Prefetch en lote: una query por tipo en vez de N por item (evita N+1). ---
    const productoIds = [
      ...new Set(opts.items.filter((i) => !i.comboId && i.productoId).map((i) => i.productoId!)),
    ];
    const comboIds = [...new Set(opts.items.filter((i) => i.comboId).map((i) => i.comboId!))];

    const [productos, preciosDia, combos] = await Promise.all([
      productoIds.length
        ? prisma.producto.findMany({
            where: { id: { in: productoIds }, deletedAt: null },
            include: { grupos: { include: { opciones: true } } },
          })
        : Promise.resolve([]),
      productoIds.length
        ? prisma.precioDia.findMany({ where: { productoId: { in: productoIds }, fecha } })
        : Promise.resolve([]),
      comboIds.length
        ? prisma.combo.findMany({
            where: { id: { in: comboIds }, localId: LOCAL_ID, deletedAt: null },
            include: { items: { include: { producto: true } } },
          })
        : Promise.resolve([]),
    ]);

    const productoById = new Map(productos.map((p) => [p.id, p]));
    const precioDiaById = new Map(preciosDia.map((pd) => [pd.productoId, pd.precio.toString()]));
    const comboById = new Map(combos.map((c) => [c.id, c]));

    const calculados: ItemCalculado[] = [];
    const productosUsados = new Map<string, ProductoSnapshot>(); // para revalidar disponibilidad
    const combosUsados = new Set<string>();

    for (const it of opts.items) {
      if (it.comboId) {
        const combo = comboById.get(it.comboId);
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
        const p = productoById.get(productoId);
        if (!p) {
          throw new AppError(ErrorCode.NOT_FOUND, "Producto no existe", { productoId });
        }
        snap = {
          id: p.id,
          nombre: p.nombre,
          // Precio del día (promo) vigente hoy, si existe.
          precioBase: precioDiaById.get(productoId) ?? p.precioBase.toString(),
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

    // Reintenta si dos pedidos concurrentes de la misma sesión chocan en el
    // índice único (sesionId, numeroSesion): cada intento recalcula el número.
    return conReintentoConflicto(
      () =>
        withTransaction(async ({ tx, emitAfter }) => {
          const sesion = await tx.sesionMesa.findUniqueOrThrow({ where: { id: opts.sesionId } });
          if (sesion.estado !== "ABIERTA") {
            throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, "Sesión no abierta");
          }
          const numeroSesion = await pedidoRepo.siguienteNumero(tx, opts.sesionId);

          // Revalidar disponibilidad dentro de la transacción (race condition),
          // en lote: una query detecta cualquier producto/combo agotado.
          if (productosUsados.size > 0) {
            const agotado = await tx.producto.findFirst({
              where: { id: { in: [...productosUsados.keys()] }, disponible: false },
              select: { id: true, nombre: true },
            });
            if (agotado) {
              throw new AppError(ErrorCode.PRODUCT_UNAVAILABLE, `Producto ${agotado.nombre} agotado`, {
                productoId: agotado.id,
              });
            }
          }
          if (combosUsados.size > 0) {
            const frescos = await tx.combo.findMany({
              where: { id: { in: [...combosUsados] } },
              select: { id: true, disponible: true, deletedAt: true },
            });
            const frescoById = new Map(frescos.map((c) => [c.id, c]));
            for (const id of combosUsados) {
              const f = frescoById.get(id);
              if (!f || f.deletedAt || !f.disponible) {
                throw new AppError(ErrorCode.PRODUCT_UNAVAILABLE, "Combo no disponible", {
                  comboId: id,
                });
              }
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
          emitAfter((emit) =>
            emit(["kds", `sesion:${opts.sesionId}`], "pedido:creado", {
              pedidoId: pedido.id,
              sesionId: opts.sesionId,
              etaSegundos,
            }),
          );

          return pedido;
        }),
      { target: "numeroSesion" },
    );
  },

  async transicionar(
    pedidoId: string,
    nuevo: PedidoEstado,
    opts?: { motivo?: string; actor?: string },
  ) {
    return withTransaction(async ({ tx, emitAfter }) => {
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
      if (nuevo === "CANCELADO") {
        emitAfter((emit) =>
          emit([`sesion:${p.sesionId}`, "kds", "mozos"], "pedido:cancelado", {
            pedidoId,
            motivo: opts?.motivo ?? "Sin motivo",
          }),
        );
      } else {
        emitAfter((emit) =>
          emit([`sesion:${p.sesionId}`, "kds", "mozos"], "pedido:estado", {
            pedidoId,
            estado: nuevo,
            etaSegundos: 0,
          }),
        );
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
