import { expect, test } from "@playwright/test";

import { limpiarCacheDeConsultas } from "./sembrar.ts";

/**
 * El «disponible real» resta la deuda de las tarjetas, y las tres pantallas
 * donde sale (cabecera, Dashboard y Cuentas) enseñan la MISMA cifra.
 */

/** Deja al usuario con activos, un colchón y deuda de tarjeta conocidos. */
async function sembrarEscenario(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(async () => {
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

    // Cuenta con colchón: 1000 de saldo, 200 apartados.
    if (!existentes.some((c) => c.name === "Caja DR")) {
      await j("POST", "/api/accounts", {
        name: "Caja DR",
        type: "BANK",
        balance: 1000,
        bufferAmount: 200,
        bufferApplied: true,
        colorHex: "#2196F3",
        iconName: "AccountBalance",
        includeInTotal: true,
      });
    }

    // Tarjeta con 300 de deuda.
    if (!existentes.some((c) => c.name === "Tarjeta DR")) {
      await j("POST", "/api/accounts", {
        name: "Tarjeta DR",
        type: "CREDIT_CARD",
        balance: 0,
        creditLimit: 1000,
        colorHex: "#F44336",
        iconName: "CreditCard",
        includeInTotal: true,
      });

      const cuentas = (await j("GET", "/api/accounts")) as Cuenta[];
      const tarjeta = cuentas.find((c) => c.name === "Tarjeta DR")!;
      const cats = (await j("GET", "/api/categories")) as {
        id: string;
        name: string;
        type: string;
      }[];

      await j("POST", "/api/transactions", {
        amount: 300,
        type: "EXPENSE",
        accountId: tarjeta.id,
        categoryId: cats.find((c) => c.name === "Compras" && c.type === "EXPENSE")!.id,
        date: Date.now(),
        note: "Deuda DR",
      });
    }
  });

  await limpiarCacheDeConsultas(page);
}

/** Lee la cifra grande de «Disponible real» de la pantalla actual. */
async function leerDisponible(page: import("@playwright/test").Page) {
  const etiqueta = page.getByText("Disponible real").first();
  await expect(etiqueta).toBeVisible();
  return etiqueta.locator("xpath=following-sibling::p[1]").innerText();
}

test("resta la deuda de las tarjetas, no solo los colchones", async ({ page }) => {
  await sembrarEscenario(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto("/cuentas");
  await page.waitForLoadState("networkidle");

  // Con las cuentas sembradas, lo que aporta este escenario es
  // +1000 de activos, −200 de colchón y −300 de deuda.
  const resumen = page.getByText("Disponible real").first().locator("../..");
  await expect(resumen).toContainText("para gastar hoy");

  // El desglose tiene que nombrar la deuda como línea propia.
  await page
    .getByRole("button", { name: /Ver de dónde sale/ })
    .first()
    .click();
  await expect(page.getByText("Deuda de tarjetas").first()).toBeVisible();
});

test("la cabecera, el Dashboard y Cuentas dicen la misma cifra", async ({ page }) => {
  await sembrarEscenario(page);
  // A 1280 hay cabecera con la cifra, y el Dashboard la repite en su tarjeta.
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // En el Dashboard hay dos: la de la cabecera y la de la tarjeta verde.
  const enInicio = await page.getByText("Disponible real").count();
  expect(enInicio, "el Dashboard debería enseñarlo").toBeGreaterThan(0);

  const cifras = await page
    .locator("xpath=//p[normalize-space()='Disponible real']/following-sibling::p[1]")
    .allInnerTexts();

  // Todas las apariciones de la misma pantalla coinciden entre sí.
  expect(new Set(cifras).size, `cifras distintas en Inicio: ${cifras.join(" | ")}`).toBe(
    1,
  );
  const enDashboard = cifras[0]!;

  await page.goto("/cuentas");
  await page.waitForLoadState("networkidle");
  const enCuentas = await leerDisponible(page);

  expect(enCuentas, "Cuentas no coincide con Inicio").toBe(enDashboard);
});

test("el desglose cuadra: activos − colchones − deuda", async ({ page }) => {
  await sembrarEscenario(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/cuentas");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: /Ver de dónde sale/ })
    .first()
    .click();

  const numero = (texto: string) => Number(texto.replace(/[^\d.-]/g, ""));

  const filas = await page.locator("dl >> div").allInnerTexts();
  const valores = new Map<string, number>();
  for (const fila of filas) {
    const [etiqueta, importe] = fila.split("\n");
    if (etiqueta && importe)
      valores.set(etiqueta.replace("− ", "").trim(), numero(importe));
  }

  const activos = valores.get("Activos")!;
  const colchones = valores.get("Colchones") ?? 0;
  const deuda = valores.get("Deuda de tarjetas") ?? 0;
  const resultado = valores.get("Disponible real")!;

  expect(deuda, "sin deuda el escenario no prueba nada").toBeGreaterThan(0);
  expect(activos - colchones - deuda).toBeCloseTo(resultado, 2);
});

/**
 * Regresión: el importe del resumen se recortaba.
 *
 * Con la deuda real del usuario, el «Neto» salía como "-USD 1,10…" en el panel
 * de escritorio (necesitaba 129 px y tenía 111) y en móvil se cortaban también
 * la Deuda. Un número a medias es peor que ninguno: se lee como si fuera otra
 * cifra. La petición 7 avisaba justo de esto —«el número se me va a ir a
 * negativo y grande»— así que aquí se comprueba con una deuda de ese tamaño.
 */
test("ninguna cifra de dinero del resumen se recorta", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
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
    if (existentes.some((c) => c.name === "Tarjeta Gorda DR")) return;

    // Deuda de cuatro cifras: es la que desbordaba.
    await j("POST", "/api/accounts", {
      name: "Tarjeta Gorda DR",
      type: "CREDIT_CARD",
      balance: -1503.13,
      creditLimit: 8000,
      colorHex: "#F44336",
      iconName: "CreditCard",
      includeInTotal: true,
    });
  });
  await limpiarCacheDeConsultas(page);

  for (const [width, height] of [
    [1920, 1080],
    [1280, 800],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/cuentas");
    await page.waitForLoadState("networkidle");

    const recortadas = await page.evaluate(() => {
      const malas: string[] = [];
      for (const p of document.querySelectorAll("p")) {
        const etiqueta = (p.textContent ?? "").trim();
        if (!/^(Activos|Deuda|Neto)$/.test(etiqueta)) continue;
        const valor = p.nextElementSibling;
        if (!valor) continue;
        if (valor.scrollWidth > valor.clientWidth + 1) {
          malas.push(`${etiqueta}="${valor.textContent?.trim()}"`);
        }
      }
      return malas;
    });

    expect(recortadas, `${width}x${height}: cifras recortadas`).toEqual([]);
  }
});
