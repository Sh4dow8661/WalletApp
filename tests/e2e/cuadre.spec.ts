import { expect, test } from "@playwright/test";

/**
 * Colchón por cuenta y flujo de cuadre.
 *
 * Cada test siembra su propia cuenta con un nombre único: comparten la misma
 * D1 local y reutilizar la de otro test los haría depender del orden.
 */

/** Crea una cuenta con saldo y colchón conocidos. */
async function crearCuenta(
  page: import("@playwright/test").Page,
  nombre: string,
  balance: number,
  bufferAmount: number,
) {
  await page.goto("/");
  return page.evaluate(
    async ({ nombre, balance, bufferAmount }) => {
      const j = async (metodo: string, url: string, cuerpo?: unknown) => {
        const r = await fetch(url, {
          method: metodo,
          headers: { "content-type": "application/json" },
          body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
        return r.json().catch(() => null);
      };

      await j("POST", "/api/accounts", {
        name: nombre,
        type: "BANK",
        balance,
        bufferAmount,
        bufferApplied: true,
        colorHex: "#2196F3",
        iconName: "AccountBalance",
        includeInTotal: true,
      });

      const cuentas = (await j("GET", "/api/accounts")) as { id: string; name: string }[];
      return cuentas.find((c) => c.name === nombre)!.id;
    },
    { nombre, balance, bufferAmount },
  );
}

test("con colchón se enseñan las dos cifras: balance y disponible", async ({ page }) => {
  await crearCuenta(page, "Colchon E2E", 1000, 300);

  await page.goto("/cuentas");
  await page.waitForLoadState("networkidle");

  const fila = page.getByText("Colchon E2E").locator("../../..");
  // El dinero sigue en la cuenta; lo que baja es el disponible.
  await expect(fila).toContainText("1,000.00");
  await expect(fila).toContainText("700.00 disponible");
});

test("una cuenta sin colchón no enseña nada de más", async ({ page }) => {
  await crearCuenta(page, "Sin Colchon E2E", 500, 0);

  await page.goto("/cuentas");
  await page.waitForLoadState("networkidle");

  const fila = page.getByText("Sin Colchon E2E").locator("../../..");
  await expect(fila).toContainText("500.00");
  await expect(fila).not.toContainText("disponible");
});

test("el cuadre enseña la diferencia antes de tocar nada y crea el ajuste", async ({
  page,
}) => {
  const id = await crearCuenta(page, "Cuadre E2E", 500, 0);

  await page.goto(`/cuentas/${id}/cuadrar`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Saldo según la app")).toBeVisible();

  // El banco dice 620: faltan 120 por registrar.
  await page.getByLabel("Saldo real").fill("620");

  await expect(page.getByText("Diferencia")).toBeVisible();
  await expect(page.getByText("Se creará un ingreso de")).toBeVisible();

  await page.getByRole("button", { name: /Cuadrar/ }).click();
  await expect(page).toHaveURL(/\/cuentas$/);

  // El ajuste queda en el historial como un movimiento más.
  await page.goto("/transacciones");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Ajuste de cuadre").first()).toBeVisible();
});

test("si la cuenta ya cuadra, avisa de que no creará nada", async ({ page }) => {
  const id = await crearCuenta(page, "Ya Cuadra E2E", 750, 0);

  await page.goto(`/cuentas/${id}/cuadrar`);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Saldo real").fill("750");
  await expect(page.getByText("La cuenta ya cuadra")).toBeVisible();
});

test("avisa en rojo si el saldo real no llega al colchón", async ({ page }) => {
  const id = await crearCuenta(page, "Bajo Colchon E2E", 1000, 300);

  await page.goto(`/cuentas/${id}/cuadrar`);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Saldo real").fill("100");

  const aviso = page.getByText(/Estás por debajo de tu colchón/);
  await expect(aviso).toBeVisible();
  // El aviso es texto, no solo color.
  await expect(aviso).toHaveCSS("color", "rgb(239, 68, 68)");
});

test("una tarjeta no ofrece colchón en el cuadre", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate(async () => {
    const j = async (metodo: string, url: string, cuerpo?: unknown) => {
      const r = await fetch(url, {
        method: metodo,
        headers: { "content-type": "application/json" },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      return r.json().catch(() => null);
    };
    await j("POST", "/api/accounts", {
      name: "Tarjeta Cuadre E2E",
      type: "CREDIT_CARD",
      balance: -200,
      creditLimit: 1000,
      colorHex: "#F44336",
      iconName: "CreditCard",
      includeInTotal: true,
    });
    const cuentas = (await j("GET", "/api/accounts")) as { id: string; name: string }[];
    return cuentas.find((c) => c.name === "Tarjeta Cuadre E2E")!.id;
  });

  await page.goto(`/cuentas/${id}/cuadrar`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Descontar el colchón")).toBeHidden();
});
