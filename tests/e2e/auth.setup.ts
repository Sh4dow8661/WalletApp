import { expect, test as setup } from "@playwright/test";

/**
 * Inicia sesión una sola vez y guarda la cookie para todos los tests.
 *
 * Sin esto, cada test volvería a entrar y chocaría con el rate limiting de §11
 * (5 intentos de login por minuto), que es una medida que queremos activa.
 * Reutilizar la sesión es además lo que hace un usuario real.
 */
const ESTADO = "tests/e2e/.auth/usuario.json";

const CREDENCIALES = {
  email: "e2e@walletapp.test",
  password: "contrasena-e2e-1234",
  name: "Prueba E2E",
};

setup("crear sesión y sembrar datos", async ({ page }) => {
  await page.goto("/login");

  const estado = await page.evaluate(async (cred) => {
    const pedir = (ruta: string, cuerpo: unknown) =>
      fetch(ruta, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });

    // La primera vez se registra; después basta con entrar.
    let r = await pedir("/api/auth/sign-up/email", cred);
    if (!r.ok) {
      r = await pedir("/api/auth/sign-in/email", {
        email: cred.email,
        password: cred.password,
      });
    }
    return r.status;
  }, CREDENCIALES);

  expect(estado, "no se pudo crear la sesión de pruebas").toBe(200);

  // Datos mínimos para que ninguna pantalla salga vacía en las capturas.
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

    const transacciones = (await j("GET", "/api/transactions")) as unknown[];
    if (transacciones.length > 0) return; // ya sembrado en una ejecución previa

    const cuentas = (await j("GET", "/api/accounts")) as { id: string; name: string }[];
    const categorias = (await j("GET", "/api/categories")) as {
      id: string;
      name: string;
    }[];
    const comida = categorias.find((c) => c.name === "Comida")!;
    const salario = categorias.find((c) => c.name === "Salario")!;
    const dia = 86_400_000;
    const hoy = Date.now();

    await j("POST", "/api/transactions", {
      amount: 1500,
      type: "INCOME",
      accountId: cuentas[1]!.id,
      categoryId: salario.id,
      date: hoy - dia * 5,
      note: "Nómina",
    });
    await j("POST", "/api/transactions", {
      amount: 45.9,
      type: "EXPENSE",
      accountId: cuentas[0]!.id,
      categoryId: comida.id,
      date: hoy - dia,
      note: "Supermercado",
    });
    await j("POST", "/api/transactions", {
      amount: 200,
      type: "TRANSFER",
      accountId: cuentas[1]!.id,
      transferAccountId: cuentas[0]!.id,
      date: hoy - dia * 2,
    });
    await j("POST", "/api/budgets", {
      name: "Comida del mes",
      amount: 300,
      recurrence: "MONTHLY",
      startDate: hoy - dia * 15,
      endDate: hoy + dia * 15,
    });
  });

  await page.context().storageState({ path: ESTADO });
});
