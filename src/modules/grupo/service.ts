import { prisma } from "@/lib/prisma";
import { AppError, ErrorCode } from "@/lib/errors";
import { dinero, multiplicar, sumar, toDbString } from "@/lib/dinero";
import { mesaRepo } from "@/modules/mesa/repository";
import { sesionRepo } from "@/modules/sesion/repository";
import { catalogoRepo, fechaHoyUTC } from "@/modules/catalogo/repository";
import { validarYCalcularItem, type ProductoSnapshot } from "@/modules/catalogo/service";
import { pedidoService } from "@/modules/pedido/service";
import { MesaEstado } from "@prisma/client";

export const HOLD_MS = 5 * 60 * 1000; // 5 minutos de "reserva" de la mesa

type CarritoItemRow = {
  id: string;
  participanteId: string;
  productoId: string | null;
  comboId: string | null;
  cantidad: number;
  opcionesIds: string[];
  notaLibre: string | null;
};

async function emitMesas(mesaIds: string[], estado: MesaEstado): Promise<void> {
  try {
    const { emit } = await import("@/realtime/emitter");
    for (const id of mesaIds) emit(["mozos", "admin"], "mesa:estado", { mesaId: id, estado });
  } catch {
    /* best-effort */
  }
}

export const grupoService = {
  /** Escaneo del QR: crea sesión + anfitrión si la mesa está libre, o reporta OCUPADA. */
  async escanear(localId: string, mesaId: string) {
    return prisma.$transaction(async (tx) => {
      await mesaRepo.lockManyForUpdate(tx, [mesaId]);
      const mesa = await tx.mesa.findUniqueOrThrow({ where: { id: mesaId } });

      const activa = await tx.sesionMesa.findFirst({
        where: { estado: "ABIERTA", mesas: { some: { mesaId } } },
        include: { participantes: true },
      });

      if (activa) {
        const tienePedidos = await tx.pedido.count({ where: { sesionId: activa.id } });
        const hold = tienePedidos === 0 ? new Date(Date.now() + HOLD_MS) : null;
        if (tienePedidos === 0) {
          await tx.sesionMesa.update({ where: { id: activa.id }, data: { holdExpiraEn: hold } });
        }
        return {
          estado: "OCUPADA" as const,
          sesionId: activa.id,
          mesaCodigo: mesa.codigo,
          grupoActivos: activa.participantes.filter((p) => p.activo).length,
          holdExpiraEn: hold,
        };
      }

      if (mesa.estado !== "LIBRE") {
        throw new AppError(ErrorCode.TABLE_BUSY, "Mesa no disponible para nueva sesión", { mesaId });
      }

      const sesion = await sesionRepo.crear(tx, localId, [mesaId]);
      await tx.mesa.update({ where: { id: mesaId }, data: { estado: "OCUPADA" } });
      const hold = new Date(Date.now() + HOLD_MS);
      await tx.sesionMesa.update({ where: { id: sesion.id }, data: { holdExpiraEn: hold } });
      const anfitrion = await tx.participante.create({
        data: { sesionId: sesion.id, nombre: "Comensal 1", esAnfitrion: true },
      });
      await emitMesas([mesaId], "OCUPADA");
      return {
        estado: "NUEVO" as const,
        sesionId: sesion.id,
        mesaCodigo: mesa.codigo,
        participanteId: anfitrion.id,
        mesaIds: [mesaId],
        holdExpiraEn: hold,
      };
    });
  },

  /**
   * El mozo abre una mesa libre para tomar el pedido en persona (sin QR).
   * Si la mesa ya tiene sesión abierta, la devuelve (idempotente para el mozo).
   * Sin pedidos, el hold de 5 min la libera sola igual que un escaneo.
   */
  async abrirPorMozo(localId: string, mesaId: string) {
    return prisma.$transaction(async (tx) => {
      await mesaRepo.lockManyForUpdate(tx, [mesaId]);
      const mesa = await tx.mesa.findUniqueOrThrow({ where: { id: mesaId } });

      const activa = await tx.sesionMesa.findFirst({
        where: { estado: "ABIERTA", mesas: { some: { mesaId } } },
      });
      if (activa) {
        return { sesionId: activa.id, mesaCodigo: mesa.codigo, yaExistia: true };
      }

      if (mesa.estado !== "LIBRE") {
        throw new AppError(ErrorCode.TABLE_BUSY, "Mesa no disponible", { mesaId });
      }

      const sesion = await sesionRepo.crear(tx, localId, [mesaId]);
      await tx.mesa.update({ where: { id: mesaId }, data: { estado: "OCUPADA" } });
      await tx.sesionMesa.update({
        where: { id: sesion.id },
        data: { holdExpiraEn: new Date(Date.now() + HOLD_MS) },
      });
      await emitMesas([mesaId], "OCUPADA");
      return { sesionId: sesion.id, mesaCodigo: mesa.codigo, yaExistia: false };
    });
  },

  /** Un nuevo comensal confirma que es del mismo grupo y se suma. */
  async unirme(_localId: string, mesaId: string) {
    return prisma.$transaction(async (tx) => {
      const activa = await tx.sesionMesa.findFirst({
        where: { estado: "ABIERTA", mesas: { some: { mesaId } } },
        include: { participantes: true, mesas: true },
      });
      if (!activa) {
        throw new AppError(ErrorCode.NOT_FOUND, "La mesa ya no tiene un grupo activo. Escanea de nuevo.");
      }
      const num = activa.participantes.length + 1;
      const part = await tx.participante.create({
        data: { sesionId: activa.id, nombre: `Comensal ${num}`, esAnfitrion: false },
      });
      const tienePedidos = await tx.pedido.count({ where: { sesionId: activa.id } });
      if (tienePedidos === 0) {
        await tx.sesionMesa.update({
          where: { id: activa.id },
          data: { holdExpiraEn: new Date(Date.now() + HOLD_MS) },
        });
      }
      return {
        sesionId: activa.id,
        participanteId: part.id,
        mesaIds: activa.mesas.map((m) => m.mesaId),
      };
    });
  },

  /** Estado completo del grupo (participantes, carrito con precios, total, contador). */
  async estado(participanteId: string) {
    const yo = await prisma.participante.findUnique({ where: { id: participanteId } });
    if (!yo) throw new AppError(ErrorCode.NOT_FOUND, "Participante no existe");
    const sesionId = yo.sesionId;

    const [participantes, items, tienePedidos, sesion] = await Promise.all([
      prisma.participante.findMany({ where: { sesionId }, orderBy: { creadoEn: "asc" } }),
      prisma.carritoItem.findMany({ where: { sesionId }, orderBy: { creadoEn: "asc" } }),
      prisma.pedido.count({ where: { sesionId } }),
      prisma.sesionMesa.findUniqueOrThrow({ where: { id: sesionId } }),
    ]);

    const nombreById = new Map(participantes.map((p) => [p.id, p.nombre]));
    const carrito = [];
    let total = dinero("0");
    for (const it of items) {
      const calc = await this._precioItem(it);
      const subtotal = multiplicar(dinero(calc.precioUnitario), it.cantidad);
      total = sumar(total, subtotal);
      carrito.push({
        id: it.id,
        participanteId: it.participanteId,
        participanteNombre: nombreById.get(it.participanteId) ?? "—",
        esMio: it.participanteId === participanteId,
        nombre: calc.nombre,
        esCombo: calc.esCombo,
        cantidad: it.cantidad,
        precioUnitario: calc.precioUnitario,
        subtotal: toDbString(subtotal),
        opcionesLabel: calc.opcionesLabel,
        notaLibre: it.notaLibre,
      });
    }

    const activos = participantes.filter((p) => p.activo);
    const pendientes = activos.filter((p) => !p.acepto).map((p) => p.nombre);
    const todosAceptaron = activos.length > 0 && pendientes.length === 0 && items.length > 0;

    return {
      sesionId,
      miId: participanteId,
      soyAnfitrion: yo.esAnfitrion,
      holdExpiraEn: sesion.holdExpiraEn,
      tienePedidos: tienePedidos > 0,
      participantes: participantes.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        esAnfitrion: p.esAnfitrion,
        activo: p.activo,
        acepto: p.acepto,
        soyYo: p.id === participanteId,
      })),
      carrito,
      total: toDbString(total),
      pendientes,
      todosAceptaron,
    };
  },

  /** El comensal se presenta con su nombre (reemplaza el "Comensal N" por defecto). */
  async renombrar(participanteId: string, nombre: string) {
    await this._cargarActivo(participanteId);
    await prisma.participante.update({
      where: { id: participanteId },
      data: { nombre },
    });
    return this.estado(participanteId);
  },

  /** Agrega un ítem al carrito compartido. Cualquier cambio reinicia las aceptaciones. */
  async agregarItem(
    participanteId: string,
    input: { productoId?: string; comboId?: string; cantidad: number; opcionesIds: string[]; notaLibre: string | null },
  ) {
    const yo = await this._cargarActivo(participanteId);
    if (Boolean(input.productoId) === Boolean(input.comboId)) {
      throw new AppError(ErrorCode.VALIDATION, "Indica productoId o comboId (exactamente uno)");
    }

    if (input.comboId) {
      const combo = await prisma.combo.findFirst({
        where: { id: input.comboId, deletedAt: null },
      });
      if (!combo) throw new AppError(ErrorCode.NOT_FOUND, "Combo no existe");
      if (!combo.disponible) throw new AppError(ErrorCode.PRODUCT_UNAVAILABLE, "Combo no disponible");
    } else {
      await this._validarProducto(input.productoId!, input.opcionesIds, input.cantidad);
    }

    await prisma.carritoItem.create({
      data: {
        sesionId: yo.sesionId,
        participanteId,
        productoId: input.productoId ?? null,
        comboId: input.comboId ?? null,
        cantidad: input.cantidad,
        opcionesIds: input.opcionesIds,
        notaLibre: input.notaLibre,
      },
    });
    await this._resetAceptaciones(yo.sesionId);
    await this._refrescarHold(yo.sesionId);
    return this.estado(participanteId);
  },

  /** Quita un ítem del carrito (el propio dueño o el anfitrión). */
  async quitarItem(participanteId: string, itemId: string) {
    const yo = await this._cargarActivo(participanteId);
    const item = await prisma.carritoItem.findUnique({ where: { id: itemId } });
    if (!item || item.sesionId !== yo.sesionId) {
      throw new AppError(ErrorCode.NOT_FOUND, "Ítem no está en el carrito de tu mesa");
    }
    if (item.participanteId !== participanteId && !yo.esAnfitrion) {
      throw new AppError(ErrorCode.FORBIDDEN_ROLE, "Solo puedes quitar tus ítems");
    }
    await prisma.carritoItem.delete({ where: { id: itemId } });
    await this._resetAceptaciones(yo.sesionId);
    await this._refrescarHold(yo.sesionId);
    return this.estado(participanteId);
  },

  /** El comensal acepta el pedido. Si todos los activos aceptaron, se envía a cocina. */
  async aceptar(participanteId: string) {
    const yo = await this._cargarActivo(participanteId);
    await prisma.participante.update({
      where: { id: participanteId },
      data: { acepto: true, vistoEn: new Date() },
    });
    const r = await this._intentarColocar(yo.sesionId, false);
    return { ...r, estado: await this.estado(participanteId) };
  },

  /** El anfitrión quita a un comensal inactivo (deja de bloquear el envío). */
  async quitarParticipante(hostId: string, targetId: string) {
    const host = await this._cargarActivo(hostId);
    if (!host.esAnfitrion) {
      throw new AppError(ErrorCode.FORBIDDEN_ROLE, "Solo el anfitrión puede quitar comensales");
    }
    const target = await prisma.participante.findUnique({ where: { id: targetId } });
    if (!target || target.sesionId !== host.sesionId) {
      throw new AppError(ErrorCode.NOT_FOUND, "Comensal no está en tu mesa");
    }
    if (target.esAnfitrion) {
      throw new AppError(ErrorCode.VALIDATION, "El anfitrión no puede quitarse a sí mismo");
    }
    await prisma.participante.update({ where: { id: targetId }, data: { activo: false } });
    // Solo si el quitado tenía ítems cambia el pedido → se vuelven a pedir aceptaciones.
    const borrados = await prisma.carritoItem.deleteMany({ where: { participanteId: targetId } });
    if (borrados.count > 0) await this._resetAceptaciones(host.sesionId);
    const r = await this._intentarColocar(host.sesionId, false);
    return { ...r, estado: await this.estado(hostId) };
  },

  /** El anfitrión fuerza el envío del pedido con el carrito actual. */
  async forzar(hostId: string) {
    const host = await this._cargarActivo(hostId);
    if (!host.esAnfitrion) {
      throw new AppError(ErrorCode.FORBIDDEN_ROLE, "Solo el anfitrión puede enviar por el grupo");
    }
    const r = await this._intentarColocar(host.sesionId, true);
    return { ...r, estado: await this.estado(hostId) };
  },

  /** Un comensal (no anfitrión) abandona el grupo. */
  async salir(participanteId: string) {
    const yo = await this._cargarActivo(participanteId);
    if (yo.esAnfitrion) {
      throw new AppError(ErrorCode.VALIDATION, "El anfitrión no puede abandonar el grupo");
    }
    await prisma.participante.update({ where: { id: participanteId }, data: { activo: false } });
    await prisma.carritoItem.deleteMany({ where: { participanteId } });
    await this._resetAceptaciones(yo.sesionId);
    return this._intentarColocar(yo.sesionId, false);
  },

  /** Barrido: libera mesas cuyo hold venció sin pedidos (5 min de inactividad). */
  async liberarHoldsExpirados(): Promise<number> {
    const ahora = new Date();
    const vencidas = await prisma.sesionMesa.findMany({
      where: { estado: "ABIERTA", holdExpiraEn: { not: null, lt: ahora } },
      include: { mesas: true, _count: { select: { pedidos: true } } },
    });
    let liberadas = 0;
    for (const s of vencidas) {
      if (s._count.pedidos > 0) {
        await prisma.sesionMesa.update({ where: { id: s.id }, data: { holdExpiraEn: null } });
        continue;
      }
      const mesaIds = s.mesas.map((m) => m.mesaId);
      await prisma.$transaction(async (tx) => {
        await tx.carritoItem.deleteMany({ where: { sesionId: s.id } });
        await tx.sesionMesa.update({
          where: { id: s.id },
          data: { estado: "EXPIRADA", cerradaEn: ahora, holdExpiraEn: null },
        });
        await tx.mesa.updateMany({ where: { id: { in: mesaIds } }, data: { estado: "LIBRE" } });
      });
      await emitMesas(mesaIds, "LIBRE");
      liberadas++;
    }
    return liberadas;
  },

  // ---------- internos ----------

  async _cargarActivo(participanteId: string) {
    const yo = await prisma.participante.findUnique({
      where: { id: participanteId },
      include: { sesion: true },
    });
    if (!yo) throw new AppError(ErrorCode.NOT_FOUND, "Participante no existe");
    if (yo.sesion.estado !== "ABIERTA") {
      throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, "La mesa ya no está activa");
    }
    if (!yo.activo) throw new AppError(ErrorCode.FORBIDDEN_ROLE, "Ya no formas parte del grupo");
    return yo;
  },

  async _resetAceptaciones(sesionId: string) {
    await prisma.participante.updateMany({ where: { sesionId }, data: { acepto: false } });
  },

  async _refrescarHold(sesionId: string) {
    const tienePedidos = await prisma.pedido.count({ where: { sesionId } });
    await prisma.sesionMesa.update({
      where: { id: sesionId },
      data: { holdExpiraEn: tienePedidos === 0 ? new Date(Date.now() + HOLD_MS) : null },
    });
  },

  async _intentarColocar(sesionId: string, forzar: boolean) {
    const [activos, items] = await Promise.all([
      prisma.participante.findMany({ where: { sesionId, activo: true } }),
      prisma.carritoItem.findMany({ where: { sesionId } }),
    ]);
    const todos = activos.length > 0 && activos.every((p) => p.acepto);
    if (items.length === 0 || (!forzar && !todos)) {
      if (items.length > 0) await this._refrescarHold(sesionId);
      return { pedidoCreado: false as const };
    }

    // Claim atómico: el hold no-nulo actúa como cerrojo; solo uno coloca el pedido.
    const claim = await prisma.sesionMesa.updateMany({
      where: { id: sesionId, holdExpiraEn: { not: null } },
      data: { holdExpiraEn: null },
    });
    if (claim.count !== 1) return { pedidoCreado: false as const };

    try {
      const pedido = await pedidoService.crear({
        sesionId,
        origen: "CLIENTE",
        creadoPor: null,
        items: items.map((it) => ({
          productoId: it.productoId ?? undefined,
          comboId: it.comboId ?? undefined,
          cantidad: it.cantidad,
          opcionesIds: it.opcionesIds,
          notaLibre: it.notaLibre,
        })),
      });
      await prisma.$transaction([
        prisma.carritoItem.deleteMany({ where: { sesionId } }),
        prisma.participante.updateMany({ where: { sesionId }, data: { acepto: false } }),
      ]);
      return { pedidoCreado: true as const, pedidoId: pedido.id };
    } catch (e) {
      // Falló la creación: reabrimos el hold para reintentar y no perder el carrito.
      await prisma.sesionMesa.update({
        where: { id: sesionId },
        data: { holdExpiraEn: new Date(Date.now() + HOLD_MS) },
      });
      throw e;
    }
  },

  async _precioItem(it: CarritoItemRow) {
    if (it.comboId) {
      const combo = await prisma.combo.findUnique({
        where: { id: it.comboId },
        include: { items: { include: { producto: true } } },
      });
      if (!combo) return { nombre: "Combo", esCombo: true, precioUnitario: "0.00", opcionesLabel: "" };
      return {
        nombre: combo.nombre,
        esCombo: true,
        precioUnitario: combo.precio.toString(),
        opcionesLabel: combo.items.map((c) => `${c.cantidad}× ${c.producto.nombre}`).join(", "),
      };
    }
    const prod = await prisma.producto.findUnique({
      where: { id: it.productoId! },
      include: { grupos: { include: { opciones: true } } },
    });
    if (!prod) return { nombre: "Producto", esCombo: false, precioUnitario: "0.00", opcionesLabel: "" };
    const especial = await prisma.precioDia.findUnique({
      where: { productoId_fecha: { productoId: prod.id, fecha: fechaHoyUTC() } },
    });
    let precio = dinero((especial?.precio ?? prod.precioBase).toString());
    const opciones = prod.grupos.flatMap((g) => g.opciones);
    const labels: string[] = [];
    for (const oid of it.opcionesIds) {
      const o = opciones.find((x) => x.id === oid);
      if (o) {
        precio = sumar(precio, dinero(o.deltaPrecio.toString()));
        labels.push(o.nombre);
      }
    }
    return {
      nombre: prod.nombre,
      esCombo: false,
      precioUnitario: toDbString(precio),
      opcionesLabel: labels.join(", "),
    };
  },

  async _validarProducto(productoId: string, opcionesIds: string[], cantidad: number) {
    const p = await catalogoRepo.findProductoConModificadores(productoId);
    if (!p) throw new AppError(ErrorCode.NOT_FOUND, "Producto no existe");
    const especial = await prisma.precioDia.findUnique({
      where: { productoId_fecha: { productoId, fecha: fechaHoyUTC() } },
    });
    const snap: ProductoSnapshot = {
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
    // Lanza si la selección es inválida (modificadores obligatorios, no disponibles, etc.)
    validarYCalcularItem(snap, { productoId, cantidad, opcionesIds, notaLibre: null });
  },
};
