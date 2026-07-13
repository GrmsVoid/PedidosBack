# syntax=docker/dockerfile:1
# API Node (Express + Socket.IO). Build multi-stage: la imagen final NO contiene
# el código fuente .ts ni el toolchain (tsx/esbuild/vitest); solo un bundle
# minificado dist/index.js + dependencias de producción, corriendo como no-root.
# Debian slim (no Alpine): Prisma necesita OpenSSL/glibc. Node 22: pnpm 11 exige >= 22.13.

# ---------------------------------------------------------------------------
# Stage 1 — builder: instala todo, genera el cliente Prisma y empaqueta a un JS.
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate
WORKDIR /app

# Deps completas (incluye esbuild). El schema va antes para el postinstall de Prisma.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# Código + cliente Prisma + bundle minificado (dist/index.js).
COPY . .
RUN pnpm exec prisma generate
RUN pnpm run build

# ---------------------------------------------------------------------------
# Stage 2 — runtime: imagen final mínima. Solo deps de producción + dist/.
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate
WORKDIR /app
ENV NODE_ENV=production

# Solo dependencias de producción (sin tsx/esbuild/vitest). `prisma` es dep de
# producción para poder aplicar migraciones y regenerar el cliente aquí.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --prod --frozen-lockfile \
  && pnpm exec prisma generate \
  && pnpm store prune

# El bundle trae TODO nuestro código en un archivo: el fuente .ts nunca entra aquí.
COPY --from=builder /app/dist ./dist

# Ejecuta como usuario sin privilegios (mitiga el impacto de un RCE).
USER node
EXPOSE 4000
# Arranque: aplica migraciones pendientes y levanta el bundle con node.
CMD ["sh", "-c", "echo '[boot] aplicando migraciones...' && pnpm exec prisma migrate deploy && echo '[boot] migraciones OK; arrancando API...' && node dist/index.js"]
