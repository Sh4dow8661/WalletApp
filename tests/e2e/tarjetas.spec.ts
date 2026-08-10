import { expect, test } from "@playwright/test";

/**
 * Tarjetas de crédito separadas de las cuentas, con su utilización.
 *
 * Va en su propio archivo, y no en `responsive.spec.ts`, porque aquí se
 * siembran datos concretos (una tarjeta con límite y su deuda) y mezclarlos
 * con el recorrido de tamaños haría los dos más frágiles.
 */

/** Crea una tarjeta con límite y le mete un gasto, dejándola a un % conocido. */
async function sembrarTarjeta(
  page: import("@playwright/test").Page,
  nombre: string,
  limite: number | null,
  gasto: number,
) {
  await page.goto("/");
  await page.evaluate(
    async ({ nombre, limite, gasto }) => {
      const j = async (metodo: string, url: string, cuerpo?: unknown) => {
        const r = await fetch(url, {
          method: metodo,
          headers: { "content-type": "application/json" },
          body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
        return r.json().catch(() => null);
      };

      const existentes = (await j("GET", "/api/accounts")) as { name: string }[];
      if (existentes.some((c) => c.name === nombre)) return;

      await j("POST", "/api/accounts", {
        name: nombre,
        type: "CREDIT_CARD",
        balance: 0,
        creditLimit: limite,
        colorHex: "#F44336",
        iconName: "CreditCard",
        includeInTotal: true,
      });

      const cuentas = (await j("GET", "/api/accounts")) as { id: string; name: string }[];
      const tarjeta = cuentas.find((c) => c.name === nombre)!;

      if (gasto > 0) {
        const cats = (await j("GET", "/api/categories")) as {
          id: string;
          name: string;
        }[];
        await j("POST", "/api/transactions", {
          amount: gasto,
          type: "EXPENSE",
          accountId: tarjeta.id,
          categoryId: cats.find((c) => c.name === "Compras")!.id,
          date: Date.now(),
          note: `Gasto de ${nombre}`,
        });
      }
    },
    { nombre, limite, gasto },
  );
}

test("las tarjetas van en su propia sección, aparte de las cuentas", async ({ page }) => {
  // 250 de deuda sobre 1000 de límite = 25 %.
  await sembrarTarjeta(page, "Visa E2E", 1000, 250);

  await page.goto("/cuentas");
  await page.waitForLoadState("networkidle");

  // Por nivel: "Cuentas" es además el título de la pantalla (h1), y sin
  // distinguirlos el modo estricto de Playwright encontraría dos.
  await expect(
    page.getByRole("heading", { name: "Cuentas", exact: true, level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tarjetas de crédito", level: 2 }),
  ).toBeVisible();

  // La deuda se enseña en positivo, no como un balance negativo.
  const tarjeta = page.getByRole("link", { name: /Visa E2E/ });
  await expect(tarjeta).toContainText("25 %");
  await expect(tarjeta).not.toContainText("-250");

  // El aviso es texto, no solo color: tiene que leerse sin distinguir el verde
  // del rojo.
  await expect(tarjeta).toContainText("Bien");
});

test("el resumen separa activos, deuda y neto", async ({ page }) => {
  await sembrarTarjeta(page, "Visa E2E", 1000, 250);

  await page.goto("/cuentas");
  await page.waitForLoadState("networkidle");

  // "Deuda" también rotula cada fila de tarjeta, así que se busca dentro del
  // resumen y no en toda la página.
  const resumen = page.getByText("Utilización total del crédito").locator("../..");
  for (const etiqueta of ["Activos", "Deuda", "Neto"]) {
    await expect(resumen.getByText(etiqueta, { exact: true })).toBeVisible();
  }
});

test("una tarjeta sin límite no inventa un porcentaje", async ({ page }) => {
  await sembrarTarjeta(page, "Sin Limite E2E", null, 120);

  await page.goto("/cuentas");
  await page.waitForLoadState("networkidle");

  const tarjeta = page.getByRole("link", { name: /Sin Limite E2E/ });
  await expect(tarjeta).toContainText("Sin límite configurado");
  await expect(tarjeta).not.toContainText("%");
});

test("el campo de límite solo aparece en las tarjetas", async ({ page }) => {
  await page.goto("/cuentas/nueva");
  await page.waitForLoadState("networkidle");

  const limite = page.getByLabel("Límite de crédito");
  // El tipo por defecto es efectivo: el campo no debe estar.
  await expect(limite).toBeHidden();

  await page.getByLabel("Tipo").selectOption("CREDIT_CARD");
  await expect(limite).toBeVisible();

  // Y al volver a un tipo sin límite, desaparece.
  await page.getByLabel("Tipo").selectOption("BANK");
  await expect(limite).toBeHidden();
});

test("el dashboard enseña la utilización agregada", async ({ page }) => {
  await sembrarTarjeta(page, "Visa E2E", 1000, 250);

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Utilización del crédito")).toBeVisible();
});
