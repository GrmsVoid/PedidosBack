import type { PedidoEstado, MesaEstado } from "@prisma/client";

export type EventMap = {
  "pedido:creado": { pedidoId: string; sesionId: string; etaSegundos: number };
  "pedido:estado": { pedidoId: string; estado: PedidoEstado; etaSegundos: number };
  "pedido:cancelado": { pedidoId: string; motivo: string };
  "mesa:estado": { mesaId: string; estado: MesaEstado };
  "evento:llamar_mozo": { eventoId: string; sesionId: string; mesa: string; marcaTiempo: string };
  "evento:pedir_cuenta": {
    eventoId: string;
    sesionId: string;
    mesa: string;
    totalActual: string;
  };
  "producto:disponibilidad": { productoId: string; disponible: boolean };
  "pago:registrado": { sesionId: string; restante: string };
  "sesion:cerrada": { sesionId: string; mesaIds: string[] };
  "eta:recalculada": { pedidoId: string; etaSegundos: number };
};

export type EventName = keyof EventMap;

/** Forma que espera socket.io para EmitEvents: nombre de evento → firma de listener. */
export type ServerToClientEvents = {
  [E in EventName]: (payload: EventMap[E]) => void;
};

export type RoomName =
  | `mesa:${string}`
  | `sesion:${string}`
  | `kds`
  | `kds:${string}`
  | `mozos`
  | `caja`
  | `admin`;
