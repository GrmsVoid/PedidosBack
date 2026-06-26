-- CreateEnum
CREATE TYPE "TipoRemuneracion" AS ENUM ('FIJO_MENSUAL', 'POR_HORA', 'POR_TURNO');

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "montoTurno" DECIMAL(10,2),
ADD COLUMN     "sueldoMensual" DECIMAL(10,2),
ADD COLUMN     "tarifaHora" DECIMAL(10,2),
ADD COLUMN     "telefono" TEXT,
ADD COLUMN     "tipoRemuneracion" "TipoRemuneracion" NOT NULL DEFAULT 'FIJO_MENSUAL';

-- CreateTable
CREATE TABLE "Turno" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Turno_usuarioId_idx" ON "Turno"("usuarioId");

-- CreateIndex
CREATE INDEX "Turno_fecha_idx" ON "Turno"("fecha");

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
