import { expect, test } from "@playwright/test";

import { limpiarCacheDeConsultas } from "./sembrar.ts";

/**
 * Gastos fijos: costo mensual equivalente y pago manual.
 *
 * El helper es idempotente porque los tests comparten la misma D1 local.
 */

async function crearGastoFijo(
  page: import("@playwright/test").Page,
  nombre: string,
  amount: number,
  everyMonths: number,
) {
  await page.goto("/");
  const id = await page.evaluate(
    async ({ nombre, amount, everyMonths }) => {
      const j = async (metodo: string, url: string, cuerpo?: unknown) => {
        const r = await fetch(url, {
          method: metodo,
          headers: { "content-type": "application/json" },
          body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
        return r.json().catch(() => null);
      };

      type Gasto = { id: string; name: string };
      const existentes = (await j("GET", "/api/fixed-expenses")) as Gasto[];
      const yaEsta = existentes.find((g) => g.name === nombre);
      if (yaEsta) return yaEsta.id;

      const cuentas = (await j("GET", "/api/accounts")) as { id: string }[];
      const cats = (await j("GET", "/api/categories")) as {
        id: string;
        name: string;
        type: string;
      }[];

      await j("POST", "/api/fixed-expenses", {
        name: nombre,
        amount,
        everyMonths,
        // Dentro de 20 días: lejos del aviso de 7, para no depender del día.
        nextDueDate: Date.now() + 20 * 86_400_000,
        accountId: cuentas[0]!.id,
        categoryId: cats.find((c) => c.name === "Servicios" && c.type === "EXPENSE")!.id,
      });

      const gastos = (await j("GET", "/api/fixed-expenses")) as Gasto[];
      return gastos.find((g) => g.name === nombre)!.id;
    },
    { nombre, amount, everyMonths },
  );

  await limpiarCacheDeConsultas(page);
  return id;
}

test("un gasto anual enseña su costo mensual equivalente", async ({ page }) => {
  // 600 al año son 50 al mes: es la cifra que de verdad importa.
  const id = await crearGastoFijo(page, "Seguro E2E", 600, 12);

  await page.goto("/gastos-fijos");
  await page.waitForLoadState("networkidle");

  const fila = page.locator(`[data-gasto="${id}"]`);
  await expect(fila).toContainText("600.00");
  await expect(fila).toContainText("Cada año");
  await expect(fila).toContainText("50.00");
  await expect(fila).toContainText("al mes");
});

test("el resumen separa el equivalente mensual de lo que toca pagar", async ({
  page,
}) => {
  await crearGastoFijo(page, "Seguro E2E", 600, 12);

  await page.goto("/gastos-fijos");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Equivalente al mes")).toBeVisible();
  await expect(page.getByText("Lo que deberías apartar")).toBeVisible();
  await expect(page.getByText(/A pagar en/)).toBeVisible();
});

test("el formulario calcula el equivalente mientras escribes", async ({ page }) => {
  await page.goto("/gastos-fijos/nuevo");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Nombre").fill("Prueba equivalente");
  await page.getByLabel("Importe del recibo").fill("300");
  await page.getByLabel("Cada cuánto se paga").selectOption("6");

  // 300 cada 6 meses = 50 al mes.
  await expect(page.getByText("Te cuesta al mes", { exact: true })).toBeVisible();
  await expect(page.getByText("50.00", { exact: false }).first()).toBeVisible();
});

test("marcar como pagado crea el gasto y avanza el vencimiento", async ({ page }) => {
  const id = await crearGastoFijo(page, "Mensual E2E", 100, 1);

  await page.goto("/gastos-fijos");
  await page.waitForLoadState("networkidle");

  const fila = page.locator(`[data-gasto="${id}"]`);
  const vencimientoAntes = await fila.textContent();

  await fila.getByRole("button", { name: /Pagado/ }).click();

  // Pide confirmación: nunca se genera la transacción sola.
  await expect(page.getByText("¿Marcar como pagado?")).toBeVisible();
  await page.getByRole("button", { name: "Marcar pagado" }).click();

  // El vencimiento cambia y el gasto aparece en el historial.
  await expect
    .poll(async () => (await fila.textContent()) !== vencimientoAntes, { timeout: 5000 })
    .toBe(true);

  await page.goto("/transacciones");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Mensual E2E").first()).toBeVisible();
});

test("un gasto inactivo no suma ni avisa", async ({ page }) => {
  const id = await crearGastoFijo(page, "Inactivo E2E", 900, 1);

  await page.goto(`/gastos-fijos/${id}`);
  await page.waitForLoadState("networkidle");

  await page.getByRole("switch", { name: "Activo" }).click();
  await page.getByRole("button", { name: "Guardar" }).click();

  await page.waitForURL(/\/gastos-fijos$/);
  const fila = page.locator(`[data-gasto="${id}"]`);
  await expect(fila).toContainText("inactivo");
});
