import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

/**
 * Genera los PNG del manifest a partir del icono de la marca.
 *
 * Se ejecuta a mano (`node scripts/generar-iconos.mjs`) y los resultados se
 * versionan: son binarios que casi nunca cambian, y meterlos en el build
 * obligaría a tener sharp instalado para desplegar.
 *
 * Hay dos familias:
 * - **any**: el icono se ve entero, así que la cartera puede ocupar bastante.
 * - **maskable**: el lanzador recorta el icono con su propia forma (círculo,
 *   rombo…) y solo está garantizado el 80% central. El dibujo se encoge y el
 *   resto es fondo verde; sin ese margen, un lanzador circular cortaría la
 *   cartera.
 */

const SALIDA = fileURLToPath(new URL("../public/iconos/", import.meta.url));
const VERDE = "#0E9F6E";

// Los trazados vienen de `ic_launcher_foreground.xml` de Android, sin redibujar.
// Ocupan de x=30 a x=78 y de y=36 a y=78 dentro de un lienzo de 108, o sea que
// traen su propio margen: hay que descontarlo antes de escalar.
const DIBUJO_ANCHO = 48;
const DIBUJO_CENTRO = { x: 54, y: 57 };
const LIENZO = 108;

/**
 * Compone el SVG con el dibujo centrado y escalado.
 *
 * @param ocupacion Fracción del lado que debe ocupar el dibujo (0..1).
 */
function svg(tamano, ocupacion) {
  const escala = (ocupacion * LIENZO) / DIBUJO_ANCHO;
  const centro = LIENZO / 2;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LIENZO} ${LIENZO}" width="${tamano}" height="${tamano}">
      <rect width="${LIENZO}" height="${LIENZO}" fill="${VERDE}"/>
      <g transform="translate(${centro} ${centro}) scale(${escala}) translate(${-DIBUJO_CENTRO.x} ${-DIBUJO_CENTRO.y})">
        <path fill="#FFFFFF" d="M30,42 L78,42 L78,72 C78,75.3 75.3,78 72,78 L36,78 C32.7,78 30,75.3 30,72 Z"/>
        <path fill="#FFFFFF" d="M36,36 L72,36 L72,42 L36,42 Z"/>
        <circle cx="62" cy="58" r="4" fill="${VERDE}"/>
      </g>
    </svg>`,
  );
}

const ARCHIVOS = [
  // Se ve entero: la cartera ocupa dos tercios del lado.
  { nombre: "icon-192.png", tamano: 192, ocupacion: 0.66 },
  { nombre: "icon-512.png", tamano: 512, ocupacion: 0.66 },
  // Maskable: cabe en el 80% central con holgura.
  { nombre: "icon-maskable-512.png", tamano: 512, ocupacion: 0.5 },
  // iOS no aplica máscara, pero sí redondea las esquinas.
  { nombre: "apple-touch-icon.png", tamano: 180, ocupacion: 0.62 },
  { nombre: "favicon-32.png", tamano: 32, ocupacion: 0.72 },
];

await mkdir(SALIDA, { recursive: true });

for (const { nombre, tamano, ocupacion } of ARCHIVOS) {
  const png = await sharp(svg(tamano, ocupacion)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(new URL(nombre, `file://${SALIDA.replace(/\\/g, "/")}`), png);
  console.log(
    `${nombre.padEnd(26)} ${tamano}x${tamano}  ${(png.length / 1024).toFixed(1)} kB`,
  );
}

console.log("\nIconos generados en public/iconos/");
