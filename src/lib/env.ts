import { logger } from "./logger";

const MIN_SECRET_LEN = 32;

/** Valores de ejemplo/dev que jamás deben llegar a producción. */
const SECRETOS_PROHIBIDOS = [
  "dev-",
  "cambiar",
  "generar-con-openssl",
  "changeme",
  "secret",
  "example",
];

function esSecretoDebil(valor: string): boolean {
  const v = valor.toLowerCase();
  return valor.length < MIN_SECRET_LEN || SECRETOS_PROHIBIDOS.some((p) => v.includes(p));
}

/**
 * Valida la configuración al arranque y falla temprano con un mensaje claro,
 * en vez de arrancar con secretos débiles o CORS abierto.
 * En desarrollo solo advierte; en producción detiene el proceso.
 */
export function assertEnv(): void {
  const prod = process.env.NODE_ENV === "production";
  const errores: string[] = [];

  const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  const qrSecret = process.env.QR_SIGNING_SECRET ?? "";

  if (!authSecret) errores.push("AUTH_SECRET no está definido.");
  else if (esSecretoDebil(authSecret))
    errores.push(`AUTH_SECRET es débil o de ejemplo (mín. ${MIN_SECRET_LEN} chars aleatorios; genera uno con: openssl rand -base64 48).`);

  if (!qrSecret) errores.push("QR_SIGNING_SECRET no está definido.");
  else if (esSecretoDebil(qrSecret))
    errores.push(`QR_SIGNING_SECRET es débil o de ejemplo (mín. ${MIN_SECRET_LEN} chars aleatorios).`);

  if (authSecret && qrSecret && authSecret === qrSecret)
    errores.push("AUTH_SECRET y QR_SIGNING_SECRET no deben ser iguales.");

  if (prod && !process.env.FRONTEND_ORIGIN)
    errores.push("FRONTEND_ORIGIN es obligatorio en producción (CORS quedaría abierto).");

  if (!process.env.DATABASE_URL) errores.push("DATABASE_URL no está definido.");

  if (errores.length === 0) return;

  if (prod) {
    for (const e of errores) logger.error("Config insegura", { detalle: e });
    throw new Error(`Configuración insegura para producción:\n- ${errores.join("\n- ")}`);
  }
  for (const e of errores) logger.warn("Config insegura (solo dev)", { detalle: e });
}
