import { MesaEstado } from "@prisma/client";

const TRANSICIONES: Record<MesaEstado, MesaEstado[]> = {
  LIBRE: [MesaEstado.OCUPADA, MesaEstado.UNIDA],
  OCUPADA: [MesaEstado.LIBRE],
  UNIDA: [MesaEstado.LIBRE],
};

export function puedeTransicionarMesa(de: MesaEstado, a: MesaEstado): boolean {
  return TRANSICIONES[de].includes(a);
}
