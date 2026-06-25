import { describe, it, expect } from "vitest";
import { validarYCalcularItem, type ItemInput, type ProductoSnapshot } from "./service";
import { AppError, ErrorCode } from "@/lib/errors";

const cappuccino: ProductoSnapshot = {
  id: "p1",
  nombre: "Cappuccino",
  precioBase: "10.00",
  disponible: true,
  estacionId: "e1",
  prepTimeMinutes: 4,
  grupos: [
    {
      id: "g1",
      nombre: "Tamaño",
      obligatorio: true,
      minSeleccion: 1,
      maxSeleccion: 1,
      opciones: [
        { id: "o1", nombre: "8oz", deltaPrecio: "0.00", disponible: true },
        { id: "o2", nombre: "12oz", deltaPrecio: "2.00", disponible: true },
      ],
    },
    {
      id: "g2",
      nombre: "Extras",
      obligatorio: false,
      minSeleccion: 0,
      maxSeleccion: 3,
      opciones: [
        { id: "o3", nombre: "Extra shot", deltaPrecio: "2.00", disponible: true },
        { id: "o4", nombre: "Crema", deltaPrecio: "1.00", disponible: true },
      ],
    },
  ],
};

describe("catalogo.validarYCalcularItem", () => {
  it("calcula precio con tamaño + extras + cantidad", () => {
    const input: ItemInput = {
      productoId: "p1",
      cantidad: 2,
      opcionesIds: ["o2", "o3"],
      notaLibre: null,
    };
    const r = validarYCalcularItem(cappuccino, input);
    expect(r.precioUnitarioCongelado).toBe("14.00");
    expect(r.totalLinea).toBe("28.00");
    expect(r.modificadores).toEqual([
      { opcionId: "o2", nombreCongelado: "12oz", deltaPrecioCongelado: "2.00" },
      { opcionId: "o3", nombreCongelado: "Extra shot", deltaPrecioCongelado: "2.00" },
    ]);
  });

  it("rechaza si falta grupo obligatorio", () => {
    expect(() =>
      validarYCalcularItem(cappuccino, {
        productoId: "p1",
        cantidad: 1,
        opcionesIds: [],
        notaLibre: null,
      }),
    ).toThrowError(AppError);
    try {
      validarYCalcularItem(cappuccino, {
        productoId: "p1",
        cantidad: 1,
        opcionesIds: [],
        notaLibre: null,
      });
    } catch (e) {
      expect((e as AppError).code).toBe(ErrorCode.MODIFIER_REQUIRED_MISSING);
    }
  });

  it("rechaza si excede maxSeleccion del grupo", () => {
    expect(() =>
      validarYCalcularItem(cappuccino, {
        productoId: "p1",
        cantidad: 1,
        opcionesIds: ["o1", "o2"],
        notaLibre: null,
      }),
    ).toThrowError(AppError);
  });

  it("rechaza si el producto está agotado", () => {
    expect(() =>
      validarYCalcularItem(
        { ...cappuccino, disponible: false },
        {
          productoId: "p1",
          cantidad: 1,
          opcionesIds: ["o1"],
          notaLibre: null,
        },
      ),
    ).toThrowError(AppError);
    try {
      validarYCalcularItem(
        { ...cappuccino, disponible: false },
        {
          productoId: "p1",
          cantidad: 1,
          opcionesIds: ["o1"],
          notaLibre: null,
        },
      );
    } catch (e) {
      expect((e as AppError).code).toBe(ErrorCode.PRODUCT_UNAVAILABLE);
    }
  });

  it("rechaza cantidad <= 0", () => {
    expect(() =>
      validarYCalcularItem(cappuccino, {
        productoId: "p1",
        cantidad: 0,
        opcionesIds: ["o1"],
        notaLibre: null,
      }),
    ).toThrowError(AppError);
  });

  it("rechaza opcionId que no pertenece al producto", () => {
    expect(() =>
      validarYCalcularItem(cappuccino, {
        productoId: "p1",
        cantidad: 1,
        opcionesIds: ["o1", "FANTASMA"],
        notaLibre: null,
      }),
    ).toThrowError(AppError);
  });
});
