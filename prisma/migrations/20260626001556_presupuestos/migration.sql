-- CreateTable
CREATE TABLE "Presupuesto" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "montoLimite" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Presupuesto_localId_anio_mes_idx" ON "Presupuesto"("localId", "anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "Presupuesto_localId_categoriaId_anio_mes_key" ON "Presupuesto"("localId", "categoriaId", "anio", "mes");

-- AddForeignKey
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaGasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
