// @ts-check
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Reproduce las cifras reales del usuario para ver cómo queda un disponible
 * real muy negativo:
 *
 *     Activos 398.05 − colchones 200.00 − deuda 1503.13 = −1305.08
 *
 * Uso: node scripts/captura-disponible-real.mjs
 */

const BASE = "http://localhost:5173";
const SALIDA = "docs/capturas/disponible-real";
mkdirSync(SALIDA, { recursive: true });

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  storageState: "tests/e2e/.auth/usuario.json",
  viewport: { width: 1280, height: 900 },
});
const page = await contexto.newPage();

await page.goto(`${BASE}/`);
await page.waitForLoadState("networkidle");

const resumen = await page.evaluate(async () => {
  const j = async (metodo, url, cuerpo) => {
    const r = await fetch(url, {
      method: metodo,
      headers: { "content-type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    return r.json().catch(() => null);
  };

  const guardar = (c, cambios) =>
    j("PUT", `/api/accounts/${c.id}`, {
      name: c.name,
      type: c.type,
      balance: c.currentBalance,
      creditLimit: c.creditLimit,
      bufferAmount: c.bufferAmount,
      bufferApplied: c.bufferApplied,
      colorHex: c.colorHex,
      iconName: c.iconName,
      includeInTotal: c.includeInTotal,
      ...cambios,
    });

  let cuentas = await j("GET", "/api/accounts");

  // Fuera del total todo lo que no sea del escenario, para que las cifras
  // coincidan exactamente con las suyas.
  for (const c of cuentas) {
    if (c.includeInTotal && c.name !== "Caja Real" && c.name !== "Tarjeta Real") {
      await guardar(c, { includeInTotal: false });
    }
  }

  if (!cuentas.some((c) => c.name === "Caja Real")) {
    await j("POST", "/api/accounts", {
      name: "Caja Real",
      type: "BANK",
      balance: 398.05,
      bufferAmount: 200,
      bufferApplied: true,
      colorHex: "#2196F3",
      iconName: "AccountBalance",
      includeInTotal: true,
    });
  }

  if (!cuentas.some((c) => c.name === "Tarjeta Real")) {
    await j("POST", "/api/accounts", {
      name: "Tarjeta Real",
      type: "CREDIT_CARD",
      balance: 0,
      creditLimit: 3000,
      colorHex: "#F44336",
      iconName: "CreditCard",
      includeInTotal: true,
    });
    cuentas = await j("GET", "/api/accounts");
    const tarjeta = cuentas.find((c) => c.name === "Tarjeta Real");
    const cats = await j("GET", "/api/categories");
    await j("POST", "/api/transactions", {
      amount: 1503.13,
      type: "EXPENSE",
      accountId: tarjeta.id,
      categoryId: cats.find((c) => c.name === "Compras" && c.type === "EXPENSE").id,
      date: Date.now(),
      note: "Deuda real",
    });
  }

  cuentas = await j("GET", "/api/accounts");
  return cuentas
    .filter((c) => c.includeInTotal)
    .map((c) => ({ n: c.name, saldo: c.currentBalance, colchon: c.bufferAmount }));
});

console.log("cuentas en el total:", JSON.stringify(resumen, null, 2));

// La caché persistida no sabe nada de lo que se acaba de crear por API.
await page.evaluate(
  () =>
    new Promise((r) => {
      const p = indexedDB.deleteDatabase("walletapp");
      p.onsuccess = p.onerror = p.onblocked = () => r();
    }),
);

for (const [nombre, ruta] of [
  ["dashboard", "/"],
  ["cuentas", "/cuentas"],
]) {
  await page.goto(`${BASE}${ruta}`);
  await page.waitForLoadState("networkidle");

  // Con el desglose desplegado, que es lo que hay que revisar.
  const ver = page.getByRole("button", { name: /Ver de dónde sale/ }).first();
  if (await ver.isVisible().catch(() => false)) {
    await ver.click();
    await page.waitForTimeout(200);
  }

  await page.screenshot({ path: `${SALIDA}/${nombre}.png` });
  console.log(`\n--- ${nombre} ---`);
  console.log(
    (await page.locator("main").innerText()).split("\n").slice(0, 14).join("\n"),
  );
}

await navegador.close();
console.log(`\nCapturas en ${SALIDA}/`);
