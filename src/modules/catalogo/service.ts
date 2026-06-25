import { AppError, ErrorCode } from "@/lib/errors";
import { dinero, multiplicar, sumar, toDbString } from "@/lib/dinero";

export type OpcionSnapshot = {
  id: string;
  nombre: string;
  deltaPrecio: string;
  disponible: boolean;
};

export type GrupoSnapshot = {
  id: string;
  nombre: string;
  obligatorio: boolean;
  minSeleccion: number;
  maxSeleccion: number;
  opciones: OpcionSnapshot[];
};

export type ProductoSnapshot = {
  id: string;
  nombre: string;
  precioBase: string;
  disponible: boolean;
  estacionId: string;
  prepTimeMinutes: number;
  grupos: GrupoSnapshot[];
};

export type ItemInput = {
  productoId: string;
  cantidad: number;
  opcionesIds: string[];
  notaLibre: string | null;
};

export type ItemCalculado = {
  productoId: string;
  cantidad: number;
  precioUnitarioCongelado: string;
  notaLibre: string | null;
  estacionIdCongelada: string;
  modificadores: Array<{
    opcionId: string;
    nombreCongelado: string;
    deltaPrecioCongelado: string;
  }>;
  totalLinea: string;
};

export function validarYCalcularItem(
  producto: ProductoSnapshot,
  input: ItemInput,
): ItemCalculado {
  if (!producto.disponible) {
    throw new AppError(ErrorCode.PRODUCT_UNAVAILABLE, `Producto ${producto.nombre} agotado`, {
      productoId: producto.id,
    });
  }

  if (input.cantidad <= 0) {
    throw new AppError(ErrorCode.VALIDATION, "Cantidad debe ser mayor a 0");
  }

  // Indexar opciones del producto y validar pertenencia
  const opcionesById = new Map<string, { opcion: OpcionSnapshot; grupo: GrupoSnapshot }>();
  for (const g of producto.grupos) {
    for (const o of g.opciones) {
      opcionesById.set(o.id, { opcion: o, grupo: g });
    }
  }

  for (const opId of input.opcionesIds) {
    if (!opcionesById.has(opId)) {
      throw new AppError(ErrorCode.VALIDATION, "Opción no pertenece al producto", {
        opcionId: opId,
      });
    }
  }

  // Validar reglas de cada grupo
  for (const g of producto.grupos) {
    const seleccionadas = input.opcionesIds.filter((id) =>
      g.opciones.some((o) => o.id === id),
    );
    if (g.obligatorio && seleccionadas.length < g.minSeleccion) {
      throw new AppError(
        ErrorCode.MODIFIER_REQUIRED_MISSING,
        `Grupo "${g.nombre}" requiere mínimo ${g.minSeleccion}`,
        { grupoId: g.id },
      );
    }
    if (seleccionadas.length > g.maxSeleccion) {
      throw new AppError(
        ErrorCode.VALIDATION,
        `Grupo "${g.nombre}" admite máximo ${g.maxSeleccion}`,
        { grupoId: g.id },
      );
    }
    for (const sel of seleccionadas) {
      const op = g.opciones.find((o) => o.id === sel)!;
      if (!op.disponible) {
        throw new AppError(ErrorCode.PRODUCT_UNAVAILABLE, `Opción "${op.nombre}" no disponible`);
      }
    }
  }

  // Calcular precio unitario congelado
  const base = dinero(producto.precioBase);
  const deltas = input.opcionesIds.map((id) => dinero(opcionesById.get(id)!.opcion.deltaPrecio));
  const precioUnitario = sumar(base, ...deltas);

  // Construir modificadores congelados en orden estable (por grupo y luego por opción)
  const modificadores: ItemCalculado["modificadores"] = [];
  for (const g of producto.grupos) {
    for (const o of g.opciones) {
      if (input.opcionesIds.includes(o.id)) {
        modificadores.push({
          opcionId: o.id,
          nombreCongelado: o.nombre,
          deltaPrecioCongelado: o.deltaPrecio,
        });
      }
    }
  }

  const totalLinea = multiplicar(precioUnitario, input.cantidad);

  return {
    productoId: producto.id,
    cantidad: input.cantidad,
    precioUnitarioCongelado: toDbString(precioUnitario),
    notaLibre: input.notaLibre,
    estacionIdCongelada: producto.estacionId,
    modificadores,
    totalLinea: toDbString(totalLinea),
  };
}
