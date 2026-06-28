import type { Prisma } from "@prisma/client";

export type ProductoConModificadores = Prisma.ProductoGetPayload<{
  include: { grupos: { include: { opciones: true } } };
}>;

export type MenuPayload = {
  categorias: Array<{
    id: string;
    nombre: string;
    orden: number;
    productos: Array<{
      id: string;
      nombre: string;
      descripcion: string | null;
      imagenUrl: string | null;
      precioBase: string;
      precioAntes: string | null;
      prepTimeMinutes: number;
      disponible: boolean;
      orden: number;
      grupos: Array<{
        id: string;
        nombre: string;
        obligatorio: boolean;
        minSeleccion: number;
        maxSeleccion: number;
        opciones: Array<{
          id: string;
          nombre: string;
          deltaPrecio: string;
          disponible: boolean;
        }>;
      }>;
    }>;
  }>;
  combos: Array<{
    id: string;
    nombre: string;
    descripcion: string | null;
    precio: string;
    items: Array<{ nombre: string; cantidad: number }>;
  }>;
};
