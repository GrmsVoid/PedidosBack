-- CreateEnum
CREATE TYPE "EgresoOrigen" AS ENUM ('MANUAL', 'PLANILLA');

-- CreateTable
CREATE TABLE "CategoriaGasto" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Egreso" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT,
    "origen" "EgresoOrigen" NOT NULL DEFAULT 'MANUAL',
    "creadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Egreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaIngreso" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaIngreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngresoExtra" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT,
    "creadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngresoExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoriaGasto_localId_activa_idx" ON "CategoriaGasto"("localId", "activa");

-- CreateIndex
CREATE INDEX "Egreso_localId_fecha_idx" ON "Egreso"("localId", "fecha");

-- CreateIndex
CREATE INDEX "Egreso_categoriaId_idx" ON "Egreso"("categoriaId");

-- CreateIndex
CREATE INDEX "CategoriaIngreso_localId_activa_idx" ON "CategoriaIngreso"("localId", "activa");

-- CreateIndex
CREATE INDEX "IngresoExtra_localId_fecha_idx" ON "IngresoExtra"("localId", "fecha");

-- CreateIndex
CREATE INDEX "IngresoExtra_categoriaId_idx" ON "IngresoExtra"("categoriaId");

-- AddForeignKey
ALTER TABLE "CategoriaGasto" ADD CONSTRAINT "CategoriaGasto_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Egreso" ADD CONSTRAINT "Egreso_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Egreso" ADD CONSTRAINT "Egreso_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaGasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaIngreso" ADD CONSTRAINT "CategoriaIngreso_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngresoExtra" ADD CONSTRAINT "IngresoExtra_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngresoExtra" ADD CONSTRAINT "IngresoExtra_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaIngreso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
