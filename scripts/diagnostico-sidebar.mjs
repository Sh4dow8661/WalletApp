// @ts-check
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Diagnóstico del recorte de la barra lateral (nota de seguimiento de la
 * petición 6).
 *
 * Uso: node scripts/diagnostico-sidebar.mjs <antes|despues>
 *
 * Mide lo que el diagnóstico anterior NO miraba y por eso se le escapó: si la
 * barra de scroll le roba ancho al contenido, si hay scroll horizontal y si el
 * texto de cada rótulo cabe de verdad en su caja.
 */

const etiqueta = process.argv[2] ?? "antes";
const BASE = "http://localhost:5173";
const SALIDA = `docs/capturas/sidebar-${etiqueta}`;
mkdirSync(SALIDA, { recursive: true });

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  storageState: "tests/e2e/.auth/usuario.json",
});
const page = await contexto.newPage();

async function medir(nombre, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");

  const datos = await page.evaluate(() => {
    const nav = document.querySelector("nav[aria-label='Navegación principal']");
    const lista = nav.querySelector("[data-menu-secciones]") ?? nav;

    // Ancho que se come la barra de scroll vertical.
    const anchoRobado = lista.offsetWidth - lista.clientWidth;

    // Rótulos recortados: el texto no cabe en su caja.
    const recortados = [];
    for (const enlace of nav.querySelectorAll("a")) {
      const span = enlace.querySelector("span");
      if (!span) continue;
      const cajaTexto = span.getBoundingClientRect();
      const cajaLista = lista.getBoundingClientRect();
      // Se sale por cualquiera de los dos lados del área visible.
      if (
        cajaTexto.left < cajaLista.left - 0.5 ||
        cajaTexto.right > cajaLista.right + 0.5
      ) {
        recortados.push(span.textContent.trim());
      }
      if (span.scrollWidth > span.clientWidth + 1) {
        recortados.push(`${span.textContent.trim()} (texto truncado)`);
      }
    }

    return {
      anchoNav: nav.offsetWidth,
      anchoUtil: lista.clientWidth,
      anchoRobadoPorLaBarra: anchoRobado,
      hayScrollHorizontal: lista.scrollWidth > lista.clientWidth + 1,
      scrollWidth: lista.scrollWidth,
      clientWidth: lista.clientWidth,
      overflowX: getComputedStyle(lista).overflowX,
      rotulosRecortados: recortados,
    };
  });

  await page.screenshot({ path: `${SALIDA}/${nombre}.png` });
  // Recorte solo de la barra lateral, que es donde está el problema.
  const nav = page.locator("nav[aria-label='Navegación principal']");
  await nav.screenshot({ path: `${SALIDA}/${nombre}-solo-barra.png` });
  return datos;
}

console.log(`=== ${etiqueta.toUpperCase()} ===`);
for (const [nombre, w, h] of [
  ["escritorio-1280x720", 1280, 720],
  ["escritorio-bajo-1280x560", 1280, 560],
  ["rail-900x560", 900, 560],
  ["rail-900x420", 900, 420],
]) {
  console.log(`\n--- ${nombre} ---`);
  console.log(JSON.stringify(await medir(nombre, w, h), null, 2));
}

await navegador.close();
console.log(`\nCapturas en ${SALIDA}/`);
