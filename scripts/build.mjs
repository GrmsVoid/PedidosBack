// Empaqueta TODO nuestro código en un único dist/index.js minificado.
//
// Objetivo de "protección": la imagen final NO lleva los .ts originales ni la
// estructura de carpetas; solo un bundle minificado (identificadores acortados,
// sin comentarios ni sourcemap). Las dependencias de node_modules quedan
// EXTERNAS (Prisma trae binario nativo del motor; no se puede/quiere empaquetar).
import { build } from "esbuild";

// Deja internas (para empaquetar) las rutas relativas y el alias "@/..." del
// tsconfig; marca externo cualquier import "bare" (paquete de node_modules o
// builtin "node:*"). Así el bundle contiene solo nuestro código.
const externalizarDependencias = {
  name: "externalizar-dependencias",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return null;
      const p = args.path;
      const esInterno = p.startsWith(".") || p.startsWith("/") || p.startsWith("@/");
      return esInterno ? null : { path: p, external: true };
    });
  },
};

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: true, // acorta identificadores + elimina espacios (ofuscación-lite)
  legalComments: "none", // descarta todos los comentarios
  sourcemap: false, // sin sourcemap → no se reconstruye el fuente desde la imagen
  tsconfig: "tsconfig.json", // resuelve el alias "@/*"
  plugins: [externalizarDependencias],
  logLevel: "info",
});
