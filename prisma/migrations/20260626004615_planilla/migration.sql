-- CreateEnum
CREATE TYPE "PlanillaEstado" AS ENUM ('BORRADOR', 'CERRADA');

-- CreateTable
CREATE TABLE "PlanillaPeriodo" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "estado" "PlanillaEstado" NOT NULL DEFAULT 'CERRADA',
    "total" DECIMAL(10,2) NOT NULL,
    "egresoId" TEXT,
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanillaPeriodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanillaLinea" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoRemuneracion" "TipoRemuneracion" NOT NULL,
    "base" DECIMAL(10,2) NOT NULL,
    "turnos" INTEGER NOT NULL DEFAULT 0,
    "horas" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monto" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PlanillaLinea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanillaPeriodo_localId_anio_mes_key" ON "PlanillaPeriodo"("localId", "anio", "mes");

-- CreateIndex
CREATE INDEX "PlanillaLinea_periodoId_idx" ON "PlanillaLinea"("periodoId");

-- AddForeignKey
ALTER TABLE "PlanillaPeriodo" ADD CONSTRAINT "PlanillaPeriodo_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanillaLinea" ADD CONSTRAINT "PlanillaLinea_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "PlanillaPeriodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
