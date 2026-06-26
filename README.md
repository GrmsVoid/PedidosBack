# Sistema de Pedidos — Backend (API)

API standalone del sistema de pedidos por QR para cafetería. Cubre todo el ciclo: el cliente
escanea el QR de su mesa, arma su pedido, cocina/caja lo gestionan, y el dueño administra el
negocio (catálogo, mesas, finanzas, presupuestos y personal).

Es el repo **backend** de un sistema de **dos repos** (este + `sistema-pedidos-frontend`).

## Stack

- **Express 4** + **TypeScript**, ejecutado con `tsx` (sin paso de compilación).
- **Prisma 5** sobre **PostgreSQL 16**.
- **Socket.IO 4** en el **mismo proceso/HTTP server** que la API (los `emit()` funcionan).
- Auth **JWT propia** para staff (`jose` + `bcryptjs`); tokens de **QR firmados** para clientes.
- **Zod** (validación), **Decimal.js** (dinero sin floats).
- Tests: **Vitest** + **Testcontainers** (integración) + **supertest** (E2E in-process).

## Qué contiene

### Modelo de datos (Prisma)

- **Catálogo**: `Local`, `Estacion`, `Categoria`, `Producto`, `GrupoModificador`,
  `OpcionModificador`, `ProductoPrecioHist`.
- **Mesas y sesiones**: `Mesa` (con QR), `SesionMesa`, `SesionMesaMesas` (unir mesas),
  `EventoSesion` (llamar mozo / pedir cuenta / auditoría), `Encuesta`.
- **Pedidos y pagos**: `Pedido`, `ItemPedido`, `ItemModificador`, `Pago` (split bill).
- **Staff**: `Usuario` (con tipo de remuneración + sueldos + teléfono), `Rol`, `UsuarioRol`,
  `Turno`.
- **Finanzas**: `CategoriaGasto`, `Egreso`, `CategoriaIngreso`, `IngresoExtra`, `Presupuesto`.
- **Infra**: `IdempotencyKey` (Idempotency-Key para escrituras del cliente).

### Módulos de dominio (`src/modules`)

`catalogo`, `mesa`, `sesion`, `pedido`, `pago`, `eventos`, `reportes`, `finanzas`.
Realtime en `src/realtime` (server Socket.IO, emisores, cron de ETA).

### API REST (todo bajo `/api`)

| Área | Endpoints | Acceso |
| --- | --- | --- |
| **Auth** | `POST /auth/login` → `{ token, user }` | público |
| **Menú** | `GET /menu` (dinámico) | público |
| **Cliente (sesión por QR)** | `POST /sesion/mesa/:mesaId` (abrir), `GET /sesion/actual`, `POST /pedidos`, `POST /sesion/llamar-mozo`, `POST /sesion/pedir-cuenta`, `POST /sesion/encuesta` | sessionToken / QR |
| **Mozo** | `GET /mozo/mesas`, `GET /mozo/sesiones`, unir/separar mesas, `evento/:id/atender`, `sesion/:id/pedido` (pedido manual), `pedido/:id/entregado`, `pedido/:id/cancelar` | MOZO/ADMIN |
| **Cocina (KDS)** | `GET /kds/cola`, `pedido/:id/tomar`, `pedido/:id/listo`, `producto/:id/disponibilidad` | BARISTA/ADMIN |
| **Caja** | `GET /caja/sesiones-por-cobrar`, `sesion/:id/cuenta`, `sesion/:id/pago`, `cerrar`, `cerrar-sin-pago` | CAJERO/ADMIN |
| **Admin · catálogo** | CRUD `categorias`, CRUD `productos`, `productos/:id/modificadores` | ADMIN |
| **Admin · mesas** | CRUD `mesas`, `mesas/:id/regenerar-qr`, `qr-signing-key/rotar` | ADMIN |
| **Admin · reportes** | `reportes/ventas`, `top-productos`, `horas-pico`, `satisfaccion`, `auditoria` | ADMIN |
| **Admin · finanzas** | `finanzas/resumen`, `finanzas/cancelados`, CRUD `categorias-gasto`/`egresos`, CRUD `categorias-ingreso`/`ingresos`, `presupuestos` (GET/PUT/DELETE) | ADMIN |
| **Admin · personal** | CRUD `usuarios` (roles, remuneración, activar/desactivar), CRUD `turnos` | ADMIN |

### Seguridad / roles

- **Staff**: JWT Bearer (12 h). Roles: `MOZO`, `BARISTA`, `CAJERO`, `ADMIN`.
- **Cliente**: token de **QR firmado** por mesa → abre sesión → `sessionToken`.
- Idempotency-Key en las escrituras del cliente; manejo central de errores → HTTP.

## Estado de funcionalidades

- ✅ V1 completo: catálogo, mesas/QR, sesiones, pedidos, KDS, caja (split bill), eventos,
  encuesta, reportes, realtime.
- ✅ **Panel del dueño** — Fase A (egresos/ingresos/ganancias + cancelados),
  Fase B (presupuestos mensuales con alertas), Fase C (personal + turnos).
- ⏳ Pendiente: Fase D (planilla → egreso automático), Fase E (menú del día / combos).

## Desarrollo local

```bash
docker compose up -d              # Postgres en localhost:5466
cp .env.example .env              # ajusta secretos
pnpm install
pnpm exec prisma migrate deploy
pnpm db:seed                      # staff demo, menú y mesas con QR
pnpm dev                          # API en http://localhost:4000
```

> Si la descarga del engine de Prisma falla por TLS corporativo, exporta
> `NODE_OPTIONS=--use-system-ca` antes de `pnpm install`.

**Cuentas demo** (seed): `admin@cafe.demo / admin123` · `mozo@cafe.demo`, `barista@cafe.demo`,
`cajero@cafe.demo` (todas `demo123`).

## Scripts

| Script         | Qué hace                                                |
| -------------- | ------------------------------------------------------- |
| `pnpm dev`     | API con recarga (`tsx watch`)                           |
| `pnpm start`   | API en producción                                       |
| `pnpm build`   | Type-check (`tsc --noEmit`)                              |
| `pnpm test`    | unit + integración (Testcontainers) + E2E (supertest)   |
| `pnpm db:seed` | siembra datos demo                                       |
| `pnpm db:reset`| resetea la base y vuelve a sembrar                      |

## Variables de entorno

Ver `.env.example`. En producción: `DATABASE_URL`, `AUTH_SECRET`, `QR_SIGNING_SECRET`,
`FRONTEND_ORIGIN` (origen del front, para CORS) y `APP_TIMEZONE`. **`PORT` lo inyecta el host**
(Railway), el backend ya lo lee.

## Despliegue (Railway)

Servicio con Dockerfile. Las migraciones se aplican solas al arrancar
(`prisma migrate deploy && pnpm start`). Define las variables de arriba y genera un dominio
público. El frontend (repo aparte) debe apuntar `NEXT_PUBLIC_API_URL` a ese dominio.
