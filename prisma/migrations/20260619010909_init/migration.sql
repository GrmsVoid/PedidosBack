-- CreateEnum
CREATE TYPE "MesaEstado" AS ENUM ('LIBRE', 'OCUPADA', 'UNIDA');

-- CreateEnum
CREATE TYPE "SesionEstado" AS ENUM ('ABIERTA', 'CERRADA', 'FUGADA');

-- CreateEnum
CREATE TYPE "PedidoEstado" AS ENUM ('CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PedidoOrigen" AS ENUM ('CLIENTE', 'MOZO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'YAPE', 'POS');

-- CreateEnum
CREATE TYPE "RolCodigo" AS ENUM ('MOZO', 'BARISTA', 'CAJERO', 'ADMIN');

-- CreateEnum
CREATE TYPE "EventoTipo" AS ENUM ('LLAMAR_MOZO', 'PEDIR_CUENTA', 'MESA_UNIDA', 'MESA_SEPARADA', 'PEDIDO_CANCELADO', 'CIERRE_SIN_PAGO', 'PRECIO_CAMBIADO', 'ENCUESTA_POST_CIERRE');

-- CreateTable
CREATE TABLE "Local" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ruc" TEXT,
    "direccion" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Lima',
    "qrSigningKeyId" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Local_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estacion" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Estacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "capacidad" INTEGER NOT NULL DEFAULT 4,
    "posicionX" INTEGER NOT NULL DEFAULT 0,
    "posicionY" INTEGER NOT NULL DEFAULT 0,
    "estado" "MesaEstado" NOT NULL DEFAULT 'LIBRE',
    "qrToken" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "estacionId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "imagenUrl" TEXT,
    "precioBase" DECIMAL(10,2) NOT NULL,
    "prepTimeMinutes" INTEGER NOT NULL DEFAULT 5,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoModificador" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,
    "minSeleccion" INTEGER NOT NULL DEFAULT 0,
    "maxSeleccion" INTEGER NOT NULL DEFAULT 1,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GrupoModificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpcionModificador" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "deltaPrecio" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OpcionModificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoPrecioHist" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "precioAnterior" DECIMAL(10,2) NOT NULL,
    "precioNuevo" DECIMAL(10,2) NOT NULL,
    "cambiadoPor" TEXT NOT NULL,
    "cambiadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductoPrecioHist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "pinHash" TEXT,
    "passwordHash" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rol" (
    "id" TEXT NOT NULL,
    "codigo" "RolCodigo" NOT NULL,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioRol" (
    "usuarioId" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,

    CONSTRAINT "UsuarioRol_pkey" PRIMARY KEY ("usuarioId","rolId")
);

-- CreateTable
CREATE TABLE "SesionMesa" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn" TIMESTAMP(3),
    "cerradaPor" TEXT,
    "estado" "SesionEstado" NOT NULL DEFAULT 'ABIERTA',
    "encuestaSolicitada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SesionMesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionMesaMesas" (
    "sesionId" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,

    CONSTRAINT "SesionMesaMesas_pkey" PRIMARY KEY ("sesionId","mesaId")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "numeroSesion" INTEGER NOT NULL,
    "origen" "PedidoOrigen" NOT NULL,
    "creadoPor" TEXT,
    "confirmadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preparacionIniciadaEn" TIMESTAMP(3),
    "listoEn" TIMESTAMP(3),
    "entregadoEn" TIMESTAMP(3),
    "canceladoEn" TIMESTAMP(3),
    "canceladoMotivo" TEXT,
    "estado" "PedidoEstado" NOT NULL DEFAULT 'CONFIRMADO',

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPedido" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitarioCongelado" DECIMAL(10,2) NOT NULL,
    "notaLibre" TEXT,
    "estacionIdCongelada" TEXT NOT NULL,

    CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemModificador" (
    "id" TEXT NOT NULL,
    "itemPedidoId" TEXT NOT NULL,
    "opcionId" TEXT NOT NULL,
    "nombreCongelado" TEXT NOT NULL,
    "deltaPrecioCongelado" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "ItemModificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "cajeroId" TEXT NOT NULL,
    "comensalNum" INTEGER,
    "registradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoSesion" (
    "id" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "tipo" "EventoTipo" NOT NULL,
    "payloadJson" JSONB,
    "atendido" BOOLEAN NOT NULL DEFAULT false,
    "atendidoPor" TEXT,
    "atendidoEn" TIMESTAMP(3),
    "actorUsuarioId" TEXT,
    "actorIp" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoSesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encuesta" (
    "id" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "estrellas" INTEGER NOT NULL,
    "comentario" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Encuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Estacion_localId_activa_idx" ON "Estacion"("localId", "activa");

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_qrToken_key" ON "Mesa"("qrToken");

-- CreateIndex
CREATE INDEX "Mesa_localId_estado_idx" ON "Mesa"("localId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_localId_codigo_key" ON "Mesa"("localId", "codigo");

-- CreateIndex
CREATE INDEX "Categoria_localId_activa_idx" ON "Categoria"("localId", "activa");

-- CreateIndex
CREATE INDEX "Producto_categoriaId_disponible_idx" ON "Producto"("categoriaId", "disponible");

-- CreateIndex
CREATE INDEX "Producto_estacionId_idx" ON "Producto"("estacionId");

-- CreateIndex
CREATE INDEX "ProductoPrecioHist_productoId_cambiadoEn_idx" ON "ProductoPrecioHist"("productoId", "cambiadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_codigo_key" ON "Rol"("codigo");

-- CreateIndex
CREATE INDEX "SesionMesa_localId_estado_abiertaEn_idx" ON "SesionMesa"("localId", "estado", "abiertaEn");

-- CreateIndex
CREATE INDEX "SesionMesaMesas_mesaId_idx" ON "SesionMesaMesas"("mesaId");

-- CreateIndex
CREATE INDEX "Pedido_estado_confirmadoEn_idx" ON "Pedido"("estado", "confirmadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_sesionId_numeroSesion_key" ON "Pedido"("sesionId", "numeroSesion");

-- CreateIndex
CREATE INDEX "ItemPedido_pedidoId_idx" ON "ItemPedido"("pedidoId");

-- CreateIndex
CREATE INDEX "ItemPedido_estacionIdCongelada_idx" ON "ItemPedido"("estacionIdCongelada");

-- CreateIndex
CREATE INDEX "ItemModificador_itemPedidoId_idx" ON "ItemModificador"("itemPedidoId");

-- CreateIndex
CREATE INDEX "Pago_sesionId_idx" ON "Pago"("sesionId");

-- CreateIndex
CREATE INDEX "EventoSesion_sesionId_tipo_atendido_idx" ON "EventoSesion"("sesionId", "tipo", "atendido");

-- CreateIndex
CREATE UNIQUE INDEX "Encuesta_sesionId_key" ON "Encuesta"("sesionId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiraEn_idx" ON "IdempotencyKey"("expiraEn");

-- AddForeignKey
ALTER TABLE "Estacion" ADD CONSTRAINT "Estacion_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "Estacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoModificador" ADD CONSTRAINT "GrupoModificador_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcionModificador" ADD CONSTRAINT "OpcionModificador_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoModificador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoPrecioHist" ADD CONSTRAINT "ProductoPrecioHist_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioRol" ADD CONSTRAINT "UsuarioRol_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioRol" ADD CONSTRAINT "UsuarioRol_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionMesa" ADD CONSTRAINT "SesionMesa_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionMesaMesas" ADD CONSTRAINT "SesionMesaMesas_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionMesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionMesaMesas" ADD CONSTRAINT "SesionMesaMesas_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionMesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemModificador" ADD CONSTRAINT "ItemModificador_itemPedidoId_fkey" FOREIGN KEY ("itemPedidoId") REFERENCES "ItemPedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemModificador" ADD CONSTRAINT "ItemModificador_opcionId_fkey" FOREIGN KEY ("opcionId") REFERENCES "OpcionModificador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionMesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoSesion" ADD CONSTRAINT "EventoSesion_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionMesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encuesta" ADD CONSTRAINT "Encuesta_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionMesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
