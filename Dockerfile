# API Node standalone (Express + Socket.IO), ejecutada con tsx. Contexto de build: este repo.
FROM node:20-alpine
RUN corepack enable
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
