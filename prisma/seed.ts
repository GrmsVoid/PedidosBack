import { PrismaClient, RolCodigo, MesaEstado, TipoRemuneracion } from "@prisma/client";
import bcrypt from "bcryptjs";
import { firmarTokenMesa } from "@/lib/qr";

const prisma = new PrismaClient();

async function main() {
  // Local
  const local = await prisma.local.upsert({
    where: { id: "demo-local" },
    update: {},
    create: {
      id: "demo-local",
      nombre: "Café Demo",
      ruc: "20123456789",
      direccion: "Av. Demo 123",
      timezone: "America/Lima",
      qrSigningKeyId: "v1",
    },
  });

  // Estación única (BARRA)
  const barra = await prisma.estacion.upsert({
    where: { id: "demo-barra" },
    update: {},
    create: { id: "demo-barra", localId: local.id, nombre: "BARRA", activa: true },
  });

  // Roles
  for (const codigo of Object.values(RolCodigo)) {
    await prisma.rol.upsert({
      where: { codigo },
      update: {},
      create: { codigo },
    });
  }

  // Usuario admin demo (password "admin123", hasheado en runtime)
  const adminHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.usuario.upsert({
    where: { email: "admin@cafe.demo" },
    update: {},
    create: {
      email: "admin@cafe.demo",
      nombre: "Admin Demo",
      passwordHash: adminHash,
      activo: true,
    },
  });
  const rolAdmin = await prisma.rol.findUniqueOrThrow({ where: { codigo: "ADMIN" } });
  await prisma.usuarioRol.upsert({
    where: { usuarioId_rolId: { usuarioId: admin.id, rolId: rolAdmin.id } },
    update: {},
    create: { usuarioId: admin.id, rolId: rolAdmin.id },
  });

  // Personal demo (Fase C): un mozo, un barista y un cajero con distintas remuneraciones.
  const staffDemo = [
    { email: "mozo@cafe.demo", nombre: "María Mozo", rol: RolCodigo.MOZO, tipo: TipoRemuneracion.POR_TURNO, sueldoMensual: null, tarifaHora: null, montoTurno: "45.00" },
    { email: "barista@cafe.demo", nombre: "Bruno Barista", rol: RolCodigo.BARISTA, tipo: TipoRemuneracion.POR_HORA, sueldoMensual: null, tarifaHora: "8.00", montoTurno: null },
    { email: "cajero@cafe.demo", nombre: "Carla Caja", rol: RolCodigo.CAJERO, tipo: TipoRemuneracion.FIJO_MENSUAL, sueldoMensual: "1200.00", tarifaHora: null, montoTurno: null },
  ];
  const secretDemo = await bcrypt.hash("demo123", 10);
  for (const s of staffDemo) {
    const usuario = await prisma.usuario.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        nombre: s.nombre,
        passwordHash: secretDemo,
        activo: true,
        tipoRemuneracion: s.tipo,
        sueldoMensual: s.sueldoMensual,
        tarifaHora: s.tarifaHora,
        montoTurno: s.montoTurno,
      },
    });
    const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: s.rol } });
    await prisma.usuarioRol.upsert({
      where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: rol.id } },
      update: {},
      create: { usuarioId: usuario.id, rolId: rol.id },
    });
  }

  // 10 mesas con QR token JWT firmado real (id estable demo-mesa-N)
  for (let i = 1; i <= 10; i++) {
    const mesaId = `demo-mesa-${i}`;
    const qrToken = await firmarTokenMesa({
      mesaId,
      localId: local.id,
      keyId: local.qrSigningKeyId,
    });
    await prisma.mesa.upsert({
      where: { id: mesaId },
      update: { qrToken },
      create: {
        id: mesaId,
        localId: local.id,
        codigo: `M${i.toString().padStart(2, "0")}`,
        capacidad: i <= 8 ? 4 : 6,
        posicionX: (i - 1) % 5,
        posicionY: Math.floor((i - 1) / 5),
        estado: MesaEstado.LIBRE,
        qrToken,
      },
    });
  }

  // Categorías
  const cafe = await prisma.categoria.upsert({
    where: { id: "demo-cat-cafe" },
    update: {},
    create: { id: "demo-cat-cafe", localId: local.id, nombre: "Café", orden: 1 },
  });
  const postres = await prisma.categoria.upsert({
    where: { id: "demo-cat-postres" },
    update: {},
    create: { id: "demo-cat-postres", localId: local.id, nombre: "Postres", orden: 2 },
  });

  // Productos
  const cappuccino = await prisma.producto.upsert({
    where: { id: "demo-prod-cappuccino" },
    update: {},
    create: {
      id: "demo-prod-cappuccino",
      categoriaId: cafe.id,
      estacionId: barra.id,
      nombre: "Cappuccino",
      descripcion: "Espresso con leche vaporizada",
      precioBase: "10.00",
      prepTimeMinutes: 4,
      disponible: true,
    },
  });

  // Grupo: Tamaño (obligatorio)
  const grupoTam = await prisma.grupoModificador.upsert({
    where: { id: "demo-grupo-tam" },
    update: {},
    create: {
      id: "demo-grupo-tam",
      productoId: cappuccino.id,
      nombre: "Tamaño",
      obligatorio: true,
      minSeleccion: 1,
      maxSeleccion: 1,
      orden: 1,
    },
  });
  await prisma.opcionModificador.upsert({
    where: { id: "demo-tam-8oz" },
    update: {},
    create: { id: "demo-tam-8oz", grupoId: grupoTam.id, nombre: "8oz", deltaPrecio: "0.00", orden: 1 },
  });
  await prisma.opcionModificador.upsert({
    where: { id: "demo-tam-12oz" },
    update: {},
    create: { id: "demo-tam-12oz", grupoId: grupoTam.id, nombre: "12oz", deltaPrecio: "2.00", orden: 2 },
  });

  // Grupo: Leche (obligatorio)
  const grupoLeche = await prisma.grupoModificador.upsert({
    where: { id: "demo-grupo-leche" },
    update: {},
    create: {
      id: "demo-grupo-leche",
      productoId: cappuccino.id,
      nombre: "Leche",
      obligatorio: true,
      minSeleccion: 1,
      maxSeleccion: 1,
      orden: 2,
    },
  });
  await prisma.opcionModificador.upsert({
    where: { id: "demo-leche-entera" },
    update: {},
    create: { id: "demo-leche-entera", grupoId: grupoLeche.id, nombre: "Entera", deltaPrecio: "0.00", orden: 1 },
  });
  await prisma.opcionModificador.upsert({
    where: { id: "demo-leche-deslactosada" },
    update: {},
    create: {
      id: "demo-leche-deslactosada",
      grupoId: grupoLeche.id,
      nombre: "Deslactosada",
      deltaPrecio: "1.50",
      orden: 2,
    },
  });

  // Grupo: Extras (opcional)
  const grupoExtras = await prisma.grupoModificador.upsert({
    where: { id: "demo-grupo-extras" },
    update: {},
    create: {
      id: "demo-grupo-extras",
      productoId: cappuccino.id,
      nombre: "Extras",
      obligatorio: false,
      minSeleccion: 0,
      maxSeleccion: 3,
      orden: 3,
    },
  });
  await prisma.opcionModificador.upsert({
    where: { id: "demo-extra-shot" },
    update: {},
    create: { id: "demo-extra-shot", grupoId: grupoExtras.id, nombre: "Extra shot", deltaPrecio: "2.00", orden: 1 },
  });

  // Brownie
  await prisma.producto.upsert({
    where: { id: "demo-prod-brownie" },
    update: {},
    create: {
      id: "demo-prod-brownie",
      categoriaId: postres.id,
      estacionId: barra.id,
      nombre: "Brownie",
      precioBase: "8.00",
      prepTimeMinutes: 3,
      disponible: true,
    },
  });

  // Categorías de finanzas (Fase A): gastos e ingresos extra
  const catsGasto: Array<[string, string, number]> = [
    ["cg-insumos", "Insumos", 1],
    ["cg-servicios", "Servicios (luz, gas, agua)", 2],
    ["cg-planilla", "Planilla", 3],
    ["cg-alquiler", "Alquiler", 4],
    ["cg-mantenimiento", "Mantenimiento", 5],
    ["cg-otros", "Otros", 6],
  ];
  for (const [id, nombre, orden] of catsGasto) {
    await prisma.categoriaGasto.upsert({
      where: { id },
      update: {},
      create: { id, localId: local.id, nombre, orden },
    });
  }
  const catsIngreso: Array<[string, string, number]> = [
    ["ci-delivery", "Delivery", 1],
    ["ci-eventos", "Eventos / catering", 2],
    ["ci-propinas", "Propinas", 3],
    ["ci-otros", "Otros", 4],
  ];
  for (const [id, nombre, orden] of catsIngreso) {
    await prisma.categoriaIngreso.upsert({
      where: { id },
      update: {},
      create: { id, localId: local.id, nombre, orden },
    });
  }

  const m1 = await prisma.mesa.findUniqueOrThrow({ where: { id: "demo-mesa-1" } });
  console.warn("Seed completo. Local demo, 10 mesas, 2 productos.");
  console.warn(`Demo cliente (mesa 1): http://localhost:3000/m/demo-mesa-1?t=${m1.qrToken}`);
  console.warn("Login staff: admin@cafe.demo / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
