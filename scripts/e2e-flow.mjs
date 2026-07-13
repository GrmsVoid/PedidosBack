// Recorrido E2E del sistema contra la API local (puerto 4000).
// Simula: cliente escanea QR → pide → barista prepara → mozo entrega →
// cajero cobra y cierra → mesa vuelve a LIBRE. Falla con exit 1 si algún paso
// no devuelve lo esperado.
const API = process.env.API_URL ?? "http://localhost:4000";
const MESA_ID = process.env.MESA_ID ?? "demo-mesa-2";
const QR = process.env.QR_TOKEN; // token firmado de la mesa (obligatorio)

if (!QR) {
  console.error("Falta QR_TOKEN");
  process.exit(1);
}

let paso = 0;
function ok(titulo, extra = "") {
  paso += 1;
  console.log(`✔ ${String(paso).padStart(2, "0")} ${titulo}${extra ? ` — ${extra}` : ""}`);
}

async function req(method, path, { body, token, idem } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(idem ? { "Idempotency-Key": idem } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} → HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function login(email, secret) {
  const r = await req("POST", "/api/auth/login", { body: { email, secret } });
  return r.token;
}

// ---------- flujo ----------
const health = await req("GET", "/health");
ok("health", health.service);

// 1) CLIENTE: escanear QR y abrir sesión
const abre = await req("POST", `/api/sesion/mesa/${MESA_ID}`, { body: { qrToken: QR } });
if (abre.estado !== "NUEVO") throw new Error(`Mesa no estaba libre: ${JSON.stringify(abre)}`);
const clienteToken = abre.sessionToken;
const sesionId = abre.sesionId;
ok("cliente abre mesa por QR", `sesión ${sesionId} · mesa ${abre.mesaCodigo}`);

// 2) CLIENTE: menú público y armado del pedido
const menu = await req("GET", "/api/menu");
const cafe = menu.categorias
  .flatMap((c) => c.productos)
  .find((p) => p.id === "demo-prod-cappuccino");
if (!cafe) throw new Error("Cappuccino no está en el menú");
const brownie = menu.categorias.flatMap((c) => c.productos).find((p) => p.id === "demo-prod-brownie");
ok("menú público", `${menu.categorias.length} categorías`);

// 3) CLIENTE: crear pedido (cappuccino 12oz + extra shot, y un brownie)
const pedido = await req("POST", "/api/pedidos", {
  token: clienteToken,
  idem: `e2e-${Date.now()}`,
  body: {
    items: [
      {
        productoId: cafe.id,
        cantidad: 1,
        opcionesIds: ["demo-tam-12oz", "demo-leche-entera", "demo-extra-shot"],
        notaLibre: "sin canela",
      },
      ...(brownie ? [{ productoId: brownie.id, cantidad: 2, opcionesIds: [], notaLibre: null }] : []),
    ],
  },
});
ok("cliente crea pedido", `#${pedido.numeroSesion} · ${pedido.items.length} líneas · estado ${pedido.estado}`);

// 4) CLIENTE: ve su sesión con total
const actual = await req("GET", "/api/sesion/actual", { token: clienteToken });
ok("cliente consulta cuenta", `total S/ ${actual.total}`);

// 5) BARISTA: cola KDS → tomar → listo
const baristaToken = await login("barista@cafe.demo", "demo123");
const cola = await req("GET", "/api/kds/cola", { token: baristaToken });
const enCola = cola.pedidos.find((p) => p.id === pedido.id);
if (!enCola) throw new Error("El pedido no apareció en la cola del KDS");
ok("KDS ve el pedido en cola", `ETA ${enCola.etaSegundos}s`);

await req("PATCH", `/api/kds/pedido/${pedido.id}/tomar`, { token: baristaToken });
ok("barista toma el pedido (EN_PREPARACION)");
await req("PATCH", `/api/kds/pedido/${pedido.id}/listo`, { token: baristaToken });
ok("barista marca LISTO");

// 6) MOZO: entrega
const mozoToken = await login("mozo@cafe.demo", "demo123");
await req("PATCH", `/api/mozo/pedido/${pedido.id}/entregado`, { token: mozoToken });
ok("mozo entrega el pedido (ENTREGADO)");

// 7) CLIENTE: pide la cuenta
await req("POST", "/api/sesion/pedir-cuenta", { token: clienteToken });
ok("cliente pide la cuenta");

// 8) CAJERO: consulta cuenta, cobra el total exacto y cierra
const cajeroToken = await login("cajero@cafe.demo", "demo123");
const cuenta = await req("GET", `/api/caja/sesion/${sesionId}/cuenta`, { token: cajeroToken });
ok("caja consulta la cuenta", `total S/ ${cuenta.total} · resta S/ ${cuenta.restante}`);

await req("POST", `/api/caja/sesion/${sesionId}/pago`, {
  token: cajeroToken,
  idem: `e2e-pago-${Date.now()}`,
  body: { metodo: "EFECTIVO", monto: cuenta.restante, comensalNum: null },
});
ok("caja registra pago EFECTIVO", `S/ ${cuenta.restante}`);

// Sobrepago debe rechazarse (validación del arreglo #3)
let rechazado = false;
try {
  await req("POST", `/api/caja/sesion/${sesionId}/pago`, {
    token: cajeroToken,
    idem: `e2e-sobre-${Date.now()}`,
    body: { metodo: "EFECTIVO", monto: "5.00", comensalNum: null },
  });
} catch {
  rechazado = true;
}
if (!rechazado) throw new Error("Se aceptó un sobrepago (debía rechazarse)");
ok("sobrepago rechazado correctamente");

const cierre = await req("POST", `/api/caja/sesion/${sesionId}/cerrar`, { token: cajeroToken });
if (!cierre.ok) throw new Error("El cierre no devolvió ok");
ok("caja cierra la sesión", "token de encuesta emitido");

// 9) CLIENTE: encuesta post-cierre
await req("POST", "/api/sesion/encuesta", {
  token: cierre.tokenEncuesta,
  body: { estrellas: 5, comentario: "Excelente demo E2E" },
});
ok("cliente envía encuesta post-cierre");

// 10) La mesa quedó LIBRE (vista pública del plano para pre-pedidos)
const mozoMesas = await req("GET", "/api/mozo/mesas", { token: mozoToken });
const mesa = mozoMesas.find?.((m) => m.id === MESA_ID) ?? mozoMesas.mesas?.find((m) => m.id === MESA_ID);
if (mesa && mesa.estado !== "LIBRE") throw new Error(`Mesa quedó en ${mesa.estado}, no LIBRE`);
ok("mesa vuelve a LIBRE tras el cierre");

console.log(`\n🏁 Flujo completo OK — ${paso} pasos verificados.`);
