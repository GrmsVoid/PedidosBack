# Sistema de Pedidos — Backend (API)

API standalone del sistema de pedidos por QR para cafetería: **Express + Prisma + Socket.IO**,
ejecutada con `tsx` (sin paso de compilación). Auth JWT propia para staff
(`POST /api/auth/login` → Bearer) y tokens de QR firmados para los clientes. Socket.IO
comparte el mismo proceso HTTP que la API.

## Desarrollo local

```bash
docker compose up -d              # Postgres en localhost:5466
cp .env.example .env              # ajusta secretos
pnpm install
pnpm exec prisma migrate deploy
pnpm db:seed                      # usuarios staff, menú y mesas con QR
pnpm dev                          # API en http://localhost:4000
```

> Si la descarga del engine de Prisma falla por TLS corporativo, exporta
> `NODE_OPTIONS=--use-system-ca` antes de `pnpm install`.

## Scripts

| Script        | Qué hace                                                  |
| ------------- | --------------------------------------------------------- |
| `pnpm dev`    | API con recarga (`tsx watch`)                             |
| `pnpm start`  | API en producción                                         |
| `pnpm build`  | Type-check (`tsc --noEmit`)                               |
| `pnpm test`   | unit + integración (Testcontainers) + E2E (supertest)    |
| `pnpm db:seed`| siembra datos demo                                        |

## Variables de entorno

Ver `.env.example`. En producción: `DATABASE_URL`, `AUTH_SECRET`, `QR_SIGNING_SECRET`,
`FRONTEND_ORIGIN` (origen del front, para CORS) y `APP_TIMEZONE`. **`PORT` lo inyecta el host**
(Railway), el backend ya lo lee.

## Despliegue (Railway)

Servicio con Dockerfile. Las migraciones se aplican solas al arrancar
(`prisma migrate deploy && pnpm start`). Define las variables de arriba y genera un dominio
público. El frontend (repo aparte) debe apuntar `NEXT_PUBLIC_API_URL` a ese dominio.
