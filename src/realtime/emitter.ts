import type { EventMap, EventName, RoomName } from "./events";
import { getIo } from "./server";

export function emit<E extends EventName>(
  rooms: RoomName | RoomName[],
  event: E,
  payload: EventMap[E],
) {
  const io = getIo();
  const list = Array.isArray(rooms) ? rooms : [rooms];
  for (const r of list) {
    // socket.io no reduce Parameters<EmitEvents[E]> bajo un E genérico; el cast es
    // acotado: el tipo público de emit() ya garantiza que payload corresponde a event.
    (io.to(r).emit as (ev: E, p: EventMap[E]) => boolean)(event, payload);
  }
}
