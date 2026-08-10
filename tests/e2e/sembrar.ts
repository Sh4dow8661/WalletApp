import type { Page } from "@playwright/test";

/**
 * Utilidad para los tests que siembran datos por API.
 *
 * ## Por qué hace falta
 *
 * La app persiste la caché de TanStack Query en IndexedDB y trata los datos
 * como frescos durante un minuto (§9). Eso es lo que la hace abrir sin red, y
 * está bien.
 *
 * Pero un test que crea datos **por API, a espaldas de la app**, no invalida
 * nada: al navegar a la pantalla, TanStack restaura la caché del disco, la ve
 * fresca y NO vuelve a consultar, así que lo recién creado no aparece.
 *
 * En una máquina de desarrollo casi nunca se nota, porque los datos ya estaban
 * de una ejecución anterior. En un runner limpio falla siempre — y así es como
 * se descubrió. Por eso, después de sembrar, hay que tirar la caché.
 */

/** Nombre de la base de IndexedDB que usa `lib/persistencia.ts`. */
const BASE_CACHE = "walletapp";

/**
 * Borra la caché persistida para que la siguiente carga consulte de verdad.
 *
 * Se hace con `deleteDatabase` y no vaciando la clave: es una sola llamada y no
 * depende de cómo esté organizado el almacén por dentro.
 */
export async function limpiarCacheDeConsultas(page: Page): Promise<void> {
  await page.evaluate(async (base) => {
    await new Promise<void>((resolver) => {
      const peticion = indexedDB.deleteDatabase(base);
      // Se resuelve pase lo que pase: si la base está bloqueada o no existe, el
      // test debe seguir igualmente en vez de quedarse colgado.
      peticion.onsuccess = () => resolver();
      peticion.onerror = () => resolver();
      peticion.onblocked = () => resolver();
    });
  }, BASE_CACHE);
}

/**
 * Fija el tema en el SERVIDOR, que es la fuente de verdad.
 *
 * `localStorage` no basta: `SincronizarTema` lo pisa en cuanto llegan los
 * ajustes del usuario. Con el tema en `SYSTEM` —el valor por defecto— un runner
 * headless resuelve a claro, y cualquier comprobación de modo oscuro falla.
 */
export async function fijarTema(page: Page, modo: "LIGHT" | "DARK"): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (themeMode) => {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ themeMode }),
    });
  }, modo);
  await limpiarCacheDeConsultas(page);
}
