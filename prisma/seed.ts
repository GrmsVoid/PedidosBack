import { PrismaClient, RolCodigo, MesaEstado, TipoRemuneracion } from "@prisma/client";
import bcrypt from "bcryptjs";
import { firmarTokenMesa } from "@/lib/qr";

const prisma = new PrismaClient();

async function main() {
  // Plano demo del salón (en centímetros): un piso de 12 m × 8 m con dos zonas.
  // OJO: re-ejecutar el seed restablece este plano y las posiciones demo de las mesas.
  const planoDemo = {
    pisos: [
      {
        id: "piso-1",
        nombre: "1er piso",
        ancho: 1200,
        alto: 800,
        zonas: [
          {
            id: "zona-salon",
            nombre: "Salón principal",
            puntos: [
              { x: 0, y: 0 },
              { x: 880, y: 0 },
              { x: 880, y: 800 },
              { x: 0, y: 800 },
            ],
          },
          {
            id: "zona-terraza",
            nombre: "Terraza",
            puntos: [
              { x: 880, y: 0 },
              { x: 1200, y: 0 },
              { x: 1200, y: 800 },
              { x: 880, y: 800 },
            ],
          },
        ],
      },
    ],
  };

  // Local
  const local = await prisma.local.upsert({
    where: { id: "demo-local" },
    update: { planoJson: planoDemo },
    create: {
      id: "demo-local",
      nombre: "Café Demo",
      ruc: "20123456789",
      direccion: "Av. Demo 123",
      timezone: "America/Lima",
      qrSigningKeyId: "v1",
      planoJson: planoDemo,
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

  // 10 mesas con QR token JWT firmado real (id estable demo-mesa-N).
  // Posición = centro de la mesa dentro del plano, en cm: M01–M08 en el salón (2 filas × 4),
  // M09–M10 (6 personas) en la terraza.
  for (let i = 1; i <= 10; i++) {
    const mesaId = `demo-mesa-${i}`;
    const qrToken = await firmarTokenMesa({
      mesaId,
      localId: local.id,
      keyId: local.qrSigningKeyId,
    });
    const enTerraza = i > 8;
    const posicionX = enTerraza ? 1040 : 140 + ((i - 1) % 4) * 210;
    const posicionY = enTerraza ? 200 + (i - 9) * 350 : 220 + Math.floor((i - 1) / 4) * 330;
    await prisma.mesa.upsert({
      where: { id: mesaId },
      update: { qrToken, posicionX, posicionY, pisoId: "piso-1" },
      create: {
        id: mesaId,
        localId: local.id,
        codigo: `M${i.toString().padStart(2, "0")}`,
        capacidad: i <= 8 ? 4 : 6,
        posicionX,
        posicionY,
        pisoId: "piso-1",
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

  // Más carta demo: que la demo se sienta como un local real, no como un mock vacío.
  const salados = await prisma.categoria.upsert({
    where: { id: "demo-cat-salados" },
    update: {},
    create: { id: "demo-cat-salados", localId: local.id, nombre: "Para comer", orden: 3 },
  });
  const masProductos: Array<{
    id: string;
    categoriaId: string;
    nombre: string;
    descripcion: string;
    precioBase: string;
    prepTimeMinutes: number;
    orden: number;
  }> = [
    { id: "demo-prod-espresso", categoriaId: cafe.id, nombre: "Espresso", descripcion: "Doble shot, origen único", precioBase: "7.00", prepTimeMinutes: 2, orden: 1 },
    { id: "demo-prod-latte", categoriaId: cafe.id, nombre: "Latte", descripcion: "Suave, con arte en la espuma", precioBase: "11.00", prepTimeMinutes: 4, orden: 2 },
    { id: "demo-prod-coldbrew", categoriaId: cafe.id, nombre: "Cold Brew", descripcion: "Extracción en frío 18 h, con hielo", precioBase: "12.00", prepTimeMinutes: 2, orden: 3 },
    { id: "demo-prod-chocolate", categoriaId: cafe.id, nombre: "Chocolate caliente", descripcion: "Cacao al 70 % con leche", precioBase: "10.00", prepTimeMinutes: 4, orden: 4 },
    { id: "demo-prod-cheesecake", categoriaId: postres.id, nombre: "Cheesecake", descripcion: "De maracuyá, porción generosa", precioBase: "12.00", prepTimeMinutes: 2, orden: 1 },
    { id: "demo-prod-galleta", categoriaId: postres.id, nombre: "Galleta de avena", descripcion: "Horneada en casa, con chispas", precioBase: "5.00", prepTimeMinutes: 1, orden: 2 },
    { id: "demo-prod-toast", categoriaId: salados.id, nombre: "Toast de palta", descripcion: "Pan masa madre, palta y huevo pochado", precioBase: "16.00", prepTimeMinutes: 8, orden: 1 },
    { id: "demo-prod-sandwich", categoriaId: salados.id, nombre: "Sándwich de pollo", descripcion: "Pollo deshilachado, pesto y queso", precioBase: "15.00", prepTimeMinutes: 9, orden: 2 },
  ];
  for (const p of masProductos) {
    await prisma.producto.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, estacionId: barra.id, disponible: true },
    });
  }

  // Combo demo: desayuno (latte + toast) con precio menor que la suma.
  const combo = await prisma.combo.upsert({
    where: { id: "demo-combo-desayuno" },
    update: {},
    create: {
      id: "demo-combo-desayuno",
      localId: local.id,
      estacionId: barra.id,
      nombre: "Combo desayuno",
      descripcion: "Latte 12oz + toast de palta",
      precio: "24.00",
      disponible: true,
      orden: 1,
    },
  });
  for (const [i, productoId] of ["demo-prod-latte", "demo-prod-toast"].entries()) {
    await prisma.comboItem.upsert({
      where: { id: `demo-comboitem-${i}` },
      update: {},
      create: { id: `demo-comboitem-${i}`, comboId: combo.id, productoId, cantidad: 1 },
    });
  }

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
  console.warn("Seed completo. Local demo, 10 mesas, 10 productos, 1 combo.");
  console.warn(`Demo cliente (mesa 1): http://localhost:3000/m/demo-mesa-1?t=${m1.qrToken}`);
  console.warn("Login staff: admin@cafe.demo / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
