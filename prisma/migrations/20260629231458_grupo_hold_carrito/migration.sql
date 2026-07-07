-- AlterEnum
ALTER TYPE "SesionEstado" ADD VALUE 'EXPIRADA';

-- AlterTable
ALTER TABLE "SesionMesa" ADD COLUMN     "holdExpiraEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Participante" (
    "id" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "esAnfitrion" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "acepto" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vistoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarritoItem" (
    "id" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "participanteId" TEXT NOT NULL,
    "productoId" TEXT,
    "comboId" TEXT,
    "cantidad" INTEGER NOT NULL,
    "opcionesIds" TEXT[],
    "notaLibre" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarritoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Participante_sesionId_idx" ON "Participante"("sesionId");

-- CreateIndex
CREATE INDEX "CarritoItem_sesionId_idx" ON "CarritoItem"("sesionId");

-- CreateIndex
CREATE INDEX "CarritoItem_participanteId_idx" ON "CarritoItem"("participanteId");

-- AddForeignKey
ALTER TABLE "Participante" ADD CONSTRAINT "Participante_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionMesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarritoItem" ADD CONSTRAINT "CarritoItem_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionMesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarritoItem" ADD CONSTRAINT "CarritoItem_participanteId_fkey" FOREIGN KEY ("participanteId") REFERENCES "Participante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
