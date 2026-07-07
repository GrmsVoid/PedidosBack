# API Node standalone (Express + Socket.IO), ejecutada con tsx. Contexto de build: este repo.
# Debian slim (no Alpine): Prisma necesita OpenSSL/glibc; en Alpine el motor no carga
# libssl y migrate/generate fallan. Node 22: pnpm 11 requiere Node >= 22.13.
FROM node:22-slim
# openssl → motor de Prisma; ca-certificates → corepack descarga pnpm por HTTPS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# pnpm fijado a la versión que generó el lockfile (reproducible; evita que corepack
# baje una "latest" que suba el piso de Node y rompa el build).
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate
WORKDIR /app

# Deps (capa cacheable). El schema se copia antes para que el postinstall de Prisma
# pueda generar el cliente.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# Resto del código + cliente Prisma actualizado
COPY . .
RUN pnpm exec prisma generate

ENV NODE_ENV=production
EXPOSE 4000
# En el arranque: aplica migraciones pendientes y levanta la API.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start"]
