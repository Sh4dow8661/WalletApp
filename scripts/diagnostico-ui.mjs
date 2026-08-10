// @ts-check
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Diagnóstico de los dos problemas de la petición 6, medido en el navegador.
 *
 * Uso: node scripts/diagnostico-ui.mjs <antes|despues>
 *
 * No es parte de la suite: es la herramienta con la que se verificó el
 * diagnóstico y se sacaron las capturas de antes y después.
 */

const etiqueta = process.argv[2] ?? "antes";
const BASE = "http://localhost:5173";
const SALIDA = `docs/capturas/${etiqueta}`;
mkdirSync(SALIDA, { recursive: true });

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  storageState: "tests/e2e/.auth/usuario.json",
  viewport: { width: 1280, height: 720 },
  // 125 % de zoom, que es lo que pide comprobar la petición.
  deviceScaleFactor: 1,
});
const page = await contexto.newPage();

/** Mide si la barra lateral recorta contenido y si scrollea. */
async function medirBarra(nombre) {
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");

  const datos = await page.evaluate(() => {
    const nav = document.querySelector("nav[aria-label='Navegación principal']");
    if (!nav) return null;

    // La zona con scroll, si existe; si no, el propio nav (estado "antes").
    const lista = nav.querySelector("[data-menu-secciones]") ?? nav;
    const enlaces = [...nav.querySelectorAll("a")];
    const ultimo = enlaces.at(-1);
    const atajos = nav.querySelector("button");

    const dentro = (el, caja) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const c = caja.getBoundingClientRect();
      return b.bottom <= c.bottom + 1 && b.top >= c.top - 1;
    };

    // ¿Se puede LLEGAR al último ítem? Se baja del todo y se vuelve a mirar.
    const scrollAntes = lista.scrollTop;
    lista.scrollTop = lista.scrollHeight;
    const ultimoTrasScroll = dentro(ultimo, lista);
    lista.scrollTop = scrollAntes;

    return {
      alturaVentana: window.innerHeight,
      listaScrollHeight: lista.scrollHeight,
      listaClientHeight: lista.clientHeight,
      necesitaScroll: lista.scrollHeight > lista.clientHeight + 1,
      overflowY: getComputedStyle(lista).overflowY,
      // La barra de scroll no debe aparecer si no hace falta.
      barraDeScrollVisible: lista.offsetWidth - lista.clientWidth > 0,
      ultimoEnlace: ultimo?.textContent?.trim() ?? null,
      ultimoAlcanzable: ultimoTrasScroll,
      atajosVisible: dentro(atajos, nav),
      enlaces: enlaces.length,
    };
  });

  await page.screenshot({ path: `${SALIDA}/${nombre}-barra-1280x720.png` });
  return datos;
}

/**
 * Mide la geometría del switch en sus dos estados.
 *
 * OJO: el switch de "Contar en el balance total" arranca ENCENDIDO, así que el
 * primer estado medido es ese, no el apagado.
 */
async function medirSwitch(nombre) {
  await page.goto(`${BASE}/cuentas/nueva`);
  await page.waitForLoadState("networkidle");

  const datos = await page.evaluate(() => {
    const sw = document.querySelector("button[role='switch']");
    if (!sw) return null;
    const thumb = sw.querySelector("span");
    const fila = sw.closest("div");
    const form = sw.closest("form");

    const pista = sw.getBoundingClientRect();
    const bola = thumb.getBoundingClientRect();
    const cajaFila = fila.getBoundingClientRect();
    const cajaForm = form.getBoundingClientRect();

    return {
      pista: `${Math.round(pista.width)}x${Math.round(pista.height)}`,
      bola: `${Math.round(bola.width)}x${Math.round(bola.height)}`,
      // Aire a cada lado, que debería ser el mismo.
      margenIzq: +(bola.left - pista.left).toFixed(2),
      margenDer: +(pista.right - bola.right).toFixed(2),
      margenArriba: +(bola.top - pista.top).toFixed(2),
      margenAbajo: +(pista.bottom - bola.bottom).toFixed(2),
      seSaleDeLaPista: bola.right > pista.right + 0.5 || bola.left < pista.left - 0.5,
      // Distancia de la fila al borde derecho del formulario.
      aireDerechaFila: +(cajaForm.right - cajaFila.right).toFixed(2),
    };
  });

  await page.screenshot({ path: `${SALIDA}/${nombre}-switch-encendido.png` });

  // Y ahora apagado.
  await page.locator("button[role='switch']").first().click();
  await page.waitForTimeout(300);

  const apagado = await page.evaluate(() => {
    const sw = document.querySelector("button[role='switch']");
    const thumb = sw.querySelector("span");
    const pista = sw.getBoundingClientRect();
    const bola = thumb.getBoundingClientRect();
    return {
      margenIzq: +(bola.left - pista.left).toFixed(2),
      margenDer: +(pista.right - bola.right).toFixed(2),
      seSaleDeLaPista: bola.right > pista.right + 0.5 || bola.left < pista.left - 0.5,
    };
  });

  await page.screenshot({ path: `${SALIDA}/${nombre}-switch-apagado.png` });
  return { encendido: datos, apagado };
}

console.log(`=== ${etiqueta.toUpperCase()} ===`);
console.log("\n--- PROBLEMA 1: barra lateral a 1280x720 ---");
console.log(JSON.stringify(await medirBarra("escritorio"), null, 2));

// Ventana baja: el caso que la petición dice que se rompe.
await page.setViewportSize({ width: 1280, height: 560 });
console.log("\n--- barra lateral con la ventana baja (1280x560) ---");
console.log(JSON.stringify(await medirBarra("ventana-baja"), null, 2));

// Modo tablet: la barra estrecha de 80 px.
await page.setViewportSize({ width: 900, height: 560 });
console.log("\n--- barra lateral en tablet (900x560) ---");
console.log(JSON.stringify(await medirBarra("tablet"), null, 2));

await page.setViewportSize({ width: 1280, height: 720 });
console.log("\n--- PROBLEMA 2: switch ---");
console.log(JSON.stringify(await medirSwitch("switch"), null, 2));

await navegador.close();
console.log(`\nCapturas en ${SALIDA}/`);
