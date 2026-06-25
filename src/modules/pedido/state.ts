import { PedidoEstado } from "@prisma/client";

const TRANSICIONES: Record<PedidoEstado, PedidoEstado[]> = {
  CONFIRMADO: [PedidoEstado.EN_PREPARACION, PedidoEstado.CANCELADO],
  EN_PREPARACION: [PedidoEstado.LISTO, PedidoEstado.CANCELADO],
  LISTO: [PedidoEstado.ENTREGADO],
  ENTREGADO: [],
  CANCELADO: [],
};

export function puedeTransicionarPedido(de: PedidoEstado, a: PedidoEstado): boolean {
  return TRANSICIONES[de].includes(a);
}
