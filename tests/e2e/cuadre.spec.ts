import { expect, test } from "@playwright/test";

import { limpiarCacheDeConsultas } from "./sembrar.ts";

/**
 * Colchón por cuenta y flujo de cuadre.
 *
 * Cada test siembra su propia cuenta con un nombre único: comparten la misma
 * D1 local y reutilizar la de otro test los haría depender del orden.
 */

/**
 * Crea una cuenta con saldo y colchón conocidos, o devuelve la que ya existe.
 *
 * Idempotente a propósito: los tests comparten la misma D1 local y sin esto
 * cada ejecución iría dejando cuentas duplicadas con el mismo nombre.
 */
async function crearCuenta(
  page: import("@playwright/test").Page,
  nombre: string,
  balance: number,
  bufferAmount: number,
) {
  await page.goto("/");
  const id = await page.evaluate(
    async ({ nombre, balance, bufferAmount }) => {
      const j = async (metodo: string, url: string, cuerpo?: unknown) => {
        const r = await fetch(url, {
          method: metodo,
          headers: { "content-type": "application/json" },
          body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
        return r.json().catch(() => null);
      };

      type Cuenta = { id: string; name: string };
      const existentes = (await j("GET", "/api/accounts")) as Cuenta[];
      const yaEsta = existentes.find((c) => c.name === nombre);
      if (yaEsta) return yaEsta.id;

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

      const cuentas = (await j("GET", "/api/accounts")) as Cuenta[];
      return cuentas.find((c) => c.name === nombre)!.id;
    },
    { nombre, balance, bufferAmount },
  );

  // Se ha creado a espaldas de la app: sin tirar la caché persistida, la lista
  // se serviría de IndexedDB y la cuenta nueva no aparecería.
  await limpiarCacheDeConsultas(page);
  return id;
}

test("con colchón se enseñan las dos cifras: balance y disponible", async ({ page }) => {
  const id = await crearCuenta(page, "Colchon E2E", 1000, 300);

  await page.goto("/cuentas");
  await page.waitForLoadState("networkidle");

  // Por `data-cuenta` y no por el nombre: "Colchon E2E" es prefijo de "Sin
  // Colchon E2E" y de "Bajo Colchon E2E", así que buscar por texto casaría tres
  // filas a la vez.
  const fila = page.locator(`[data-cuenta="${id}"]`);
  // El dinero sigue en la cuenta; lo que baja es el disponible.
  await expect(fila).toContainText("1,000.00");
  await expect(fila).toContainText("700.00 disponible");
});

test("una cuenta sin colchón no enseña nada de más", async ({ page }) => {
  const id = await crearCuenta(page, "Sin Colchon E2E", 500, 0);

  await page.goto("/cuentas");
  await page.waitForLoadState("networkidle");

  const fila = page.locator(`[data-cuenta="${id}"]`);
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

  // El saldo real se calcula a partir del que tenga la cuenta AHORA, no con un
  // número fijo: si el test ya corrió antes, la cuenta quedó cuadrada en ese
  // valor y volver a teclearlo no produciría ninguna diferencia.
  const saldoActual = await page.evaluate(async (id) => {
    const cuentas = (await (await fetch("/api/accounts")).json()) as {
      id: string;
      currentBalance: number;
    }[];
    return cuentas.find((c) => c.id === id)!.currentBalance;
  }, id);

  await page.getByLabel("Saldo real").fill(String(saldoActual + 120));

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
