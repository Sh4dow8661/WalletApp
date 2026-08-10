import { type Page, expect, test } from "@playwright/test";

import { limpiarCacheDeConsultas } from "./sembrar.ts";

/**
 * Un presupuesto con categoría se mueve solo (§20).
 *
 * Lo que se prueba es justo lo que se pidió: crear el presupuesto eligiendo una
 * categoría, registrar un gasto en ella **sin tocar el enlace manual**, y ver
 * que el presupuesto avanza igualmente.
 *
 * El gasto se registra por la interfaz, no por API, porque parte de la prueba
 * es comprobar que el selector de presupuestos del formulario se queda sin
 * marcar: si se marcase, el test pasaría por el motivo equivocado.
 */

const CATEGORIA = "Presup E2E";
const PRESUPUESTO = "Presupuesto Cat E2E";
const IMPORTE = 25;

/**
 * Deja el escenario limpio: la categoría creada y sin presupuestos previos con
 * ese nombre. Los e2e comparten la misma D1, así que sin esto una segunda
 * ejecución acumularía presupuestos y el gasto contaría en todos.
 */
async function prepararEscenario(page: Page) {
  await page.goto("/");
  await page.evaluate(
    async (nombres) => {
      const j = async (metodo: string, url: string, cuerpo?: unknown) => {
        const r = await fetch(url, {
          method: metodo,
          headers: { "content-type": "application/json" },
          body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
        return r.json().catch(() => null);
      };

      type ConNombre = { id: string; name: string; type?: string };

      for (const b of (await j("GET", "/api/budgets")) as ConNombre[]) {
        if (b.name === nombres.presupuesto) await j("DELETE", `/api/budgets/${b.id}`);
      }

      const cats = (await j("GET", "/api/categories")) as ConNombre[];
      const suya = cats.find((c) => c.name === nombres.categoria);
      if (suya) {
        // Se borra y se rehace para que no arrastre gastos de una ejecución
        // anterior: al borrarla, sus transacciones se quedan sin categoría.
        await j("DELETE", `/api/categories/${suya.id}`);
      }
      await j("POST", "/api/categories", {
        name: nombres.categoria,
        type: "EXPENSE",
        iconName: "Category",
        colorHex: "#42A5F5",
      });
    },
    { categoria: CATEGORIA, presupuesto: PRESUPUESTO },
  );

  await limpiarCacheDeConsultas(page);
}

test("un presupuesto con categoría se mueve sin enlazar nada a mano", async ({
  page,
}) => {
  await prepararEscenario(page);

  // --- Crear el presupuesto eligiendo la categoría -------------------------
  await page.goto("/presupuestos/nuevo");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Nombre").fill(PRESUPUESTO);
  await page.getByLabel("Monto").fill("100");
  // NONE deja un único período entre las dos fechas, que por defecto son hoy:
  // así el gasto de hoy cae dentro sin depender del día del mes.
  await page.getByLabel("Recurrencia").selectOption("NONE");

  const chip = page.locator(`[data-categoria="${CATEGORIA}"]`);
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/\/presupuestos$/);

  // Arranca a cero: todavía no hay ningún gasto en esa categoría.
  const tarjeta = page.locator("a", { hasText: PRESUPUESTO }).first();
  await expect(tarjeta).toContainText("Cuenta solo:");
  await expect(tarjeta).toContainText(CATEGORIA);

  // --- Registrar el gasto SIN enlazarlo ------------------------------------
  await page.goto("/transacciones/nueva");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Monto").fill(String(IMPORTE));
  await page.getByLabel("Categoría").selectOption({ label: CATEGORIA });

  // La prueba de que no se enlaza a mano: el botón del presupuesto existe en el
  // formulario y se deja SIN pulsar.
  const chipPresupuesto = page.getByRole("button", { name: PRESUPUESTO, exact: true });
  await expect(chipPresupuesto).toBeVisible();
  await expect(chipPresupuesto).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/\/transacciones$/);

  // --- El presupuesto se ha movido solo ------------------------------------
  await limpiarCacheDeConsultas(page);
  await page.goto("/presupuestos");
  await page.waitForLoadState("networkidle");

  const despues = page.locator("a", { hasText: PRESUPUESTO }).first();
  await expect(despues).toContainText("25.00");
  // Y queda 75 de los 100.
  await expect(despues).toContainText("75.00");
});

test("el detalle enseña de dónde sale el gasto", async ({ page }) => {
  await page.goto("/presupuestos");
  await page.waitForLoadState("networkidle");

  const tarjeta = page.locator("a", { hasText: PRESUPUESTO }).first();
  await expect(tarjeta).toBeVisible();
  await tarjeta.click();

  const desglose = page.locator("[data-desglose-presupuesto]");
  await expect(desglose).toBeVisible();
  await expect(desglose).toContainText("Por categoría");
  await expect(desglose).toContainText("Enlazado a mano");
  // Todo entró por categoría, nada a mano.
  await expect(desglose).toContainText("25.00");
});

test("borrar la categoría avisa de que el presupuesto dejará de contarla", async ({
  page,
}) => {
  await page.goto("/categorias");
  await page.waitForLoadState("networkidle");

  await page.getByText(CATEGORIA, { exact: true }).first().click();
  await page.getByRole("button", { name: "Eliminar" }).click();

  // El aviso concreto, no el genérico: es la consecuencia que se pidió no
  // dejar en silencio (punto 7).
  await expect(
    page.getByText(new RegExp(`El presupuesto "${PRESUPUESTO}" cuenta`)),
  ).toBeVisible();
});
