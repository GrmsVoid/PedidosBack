-- Pre-pedidos web: pedido remoto elegido en el plano público, pendiente de
-- aceptación por el mozo antes de pasar a cocina.
CREATE TYPE "PrePedidoEstado" AS ENUM ('PENDIENTE', 'ACEPTADO', 'RECHAZADO', 'EXPIRADO');

CREATE TABLE "PedidoRemoto" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombreCliente" TEXT NOT NULL,
    "telefono" TEXT,
    "estado" "PrePedidoEstado" NOT NULL DEFAULT 'PENDIENTE',
    "itemsJson" JSONB NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "sesionId" TEXT,
    "resueltoPor" TEXT,
    "resueltoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoRemoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PedidoRemoto_codigo_key" ON "PedidoRemoto"("codigo");
CREATE INDEX "PedidoRemoto_localId_estado_creadoEn_idx" ON "PedidoRemoto"("localId", "estado", "creadoEn");

ALTER TABLE "PedidoRemoto" ADD CONSTRAINT "PedidoRemoto_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoRemoto" ADD CONSTRAINT "PedidoRemoto_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
