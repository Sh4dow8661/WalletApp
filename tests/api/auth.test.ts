import { describe, expect, it } from "vitest";

import type { Account, Category, UserSettings } from "../../src/shared/types.ts";

import { crearUsuario, fetchSinSesion } from "./helpers.ts";

describe("guard de sesión", () => {
  /**
   * §11: toda ruta bajo /api valida la sesión en el **servidor**. Que el
   * frontend esconda un botón no protege nada.
   */
  it.each([
    "/api/accounts",
    "/api/categories",
    "/api/transactions",
    "/api/budgets",
    "/api/settings",
    "/api/stats/dashboard",
    "/api/stats/by-category",
    "/api/stats/trend",
    "/api/stats/daily",
  ])("%s responde 401 sin sesión", async (ruta) => {
    const respuesta = await fetchSinSesion(ruta);
    expect(respuesta.status).toBe(401);
  });

  it("también bloquea las escrituras sin sesión", async () => {
    const respuesta = await fetchSinSesion("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Colada", type: "CASH", balance: 0 }),
    });
    expect(respuesta.status).toBe(401);
  });

  it("deja pasar /api/health, que no necesita sesión", async () => {
    const respuesta = await fetchSinSesion("/api/health");
    expect(respuesta.status).toBe(200);
  });

  it("rechaza una cookie de sesión inventada", async () => {
    const respuesta = await fetchSinSesion("/api/accounts", {
      headers: { cookie: "better-auth.session_token=inventado" },
    });
    expect(respuesta.status).toBe(401);
  });
});

describe("registro y siembra de datos por defecto (§11)", () => {
  it("crea la sesión y devuelve cookie HttpOnly", async () => {
    const cliente = await crearUsuario();
    expect(cliente.userId).toBeTruthy();
    expect(cliente.cookie).toContain("session_token");
  });

  it("siembra las 3 cuentas de DefaultData con sus colores e iconos", async () => {
    const cliente = await crearUsuario();
    const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));

    expect(cuentas).toHaveLength(3);
    expect(cuentas.map((c) => c.name)).toEqual([
      "Efectivo",
      "Banco",
      "Tarjeta de Crédito",
    ]);
    expect(cuentas.map((c) => c.type)).toEqual(["CASH", "BANK", "CREDIT_CARD"]);
    expect(cuentas.map((c) => c.colorHex)).toEqual(["#4CAF50", "#2196F3", "#F44336"]);
    expect(cuentas.map((c) => c.iconName)).toEqual([
      "Payments",
      "AccountBalance",
      "CreditCard",
    ]);
    // Todas arrancan a cero y cuentan para el total.
    expect(cuentas.every((c) => c.initialBalance === 0)).toBe(true);
    expect(cuentas.every((c) => c.currentBalance === 0)).toBe(true);
    expect(cuentas.every((c) => c.includeInTotal)).toBe(true);
  });

  it("siembra las 14 categorías, 9 de gasto y 5 de ingreso", async () => {
    const cliente = await crearUsuario();
    const categorias = await cliente.json<Category[]>(
      await cliente.get("/api/categories"),
    );

    expect(categorias).toHaveLength(14);

    const gasto = categorias.filter((c) => c.type === "EXPENSE");
    const ingreso = categorias.filter((c) => c.type === "INCOME");
    expect(gasto.map((c) => c.name)).toEqual([
      "Comida",
      "Transporte",
      "Vivienda",
      "Entretenimiento",
      "Salud",
      "Compras",
      "Educación",
      "Servicios",
      "Otros",
    ]);
    expect(ingreso.map((c) => c.name)).toEqual([
      "Salario",
      "Freelance",
      "Regalos",
      "Intereses",
      "Otros",
    ]);
    // Todas las sembradas quedan marcadas como por defecto.
    expect(categorias.every((c) => c.isDefault)).toBe(true);
  });

  it("crea los ajustes con la zona horaria de Puerto Rico", async () => {
    const cliente = await crearUsuario();
    const ajustes = await cliente.json<UserSettings>(await cliente.get("/api/settings"));

    expect(ajustes.currency).toBe("USD");
    expect(ajustes.themeMode).toBe("SYSTEM");
    expect(ajustes.timeZone).toBe("America/Puerto_Rico");
  });
});

describe("aislamiento entre usuarios (§7)", () => {
  it("cada usuario ve solo sus propias cuentas", async () => {
    const ana = await crearUsuario();
    const beto = await crearUsuario();

    await ana.post("/api/accounts", {
      name: "Cuenta de Ana",
      type: "BANK",
      balance: 1000,
      colorHex: "#123456",
      iconName: "AccountBalance",
      includeInTotal: true,
    });

    const deAna = await ana.json<Account[]>(await ana.get("/api/accounts"));
    const deBeto = await beto.json<Account[]>(await beto.get("/api/accounts"));

    expect(deAna.map((c) => c.name)).toContain("Cuenta de Ana");
    expect(deBeto.map((c) => c.name)).not.toContain("Cuenta de Ana");
    expect(deBeto).toHaveLength(3); // solo las sembradas
  });

  it("no se puede leer una cuenta ajena aunque se sepa su id", async () => {
    const ana = await crearUsuario();
    const beto = await crearUsuario();

    const cuentasDeAna = await ana.json<Account[]>(await ana.get("/api/accounts"));
    const idAjeno = cuentasDeAna[0]!.id;

    expect((await beto.get(`/api/accounts/${idAjeno}`)).status).toBe(404);
  });

  it("no se puede modificar ni borrar una cuenta ajena", async () => {
    const ana = await crearUsuario();
    const beto = await crearUsuario();

    const cuentasDeAna = await ana.json<Account[]>(await ana.get("/api/accounts"));
    const idAjeno = cuentasDeAna[0]!.id;

    const intentoEditar = await beto.put(`/api/accounts/${idAjeno}`, {
      name: "Secuestrada",
      type: "CASH",
      balance: 99999,
      colorHex: "#000000",
      iconName: "Payments",
      includeInTotal: true,
    });
    expect(intentoEditar.status).toBe(404);
    expect((await beto.del(`/api/accounts/${idAjeno}`)).status).toBe(404);

    // Y la cuenta de Ana sigue intacta.
    const despues = await ana.json<Account[]>(await ana.get("/api/accounts"));
    expect(despues[0]!.name).toBe("Efectivo");
    expect(despues[0]!.currentBalance).toBe(0);
  });

  it("ignora un userId enviado en el cuerpo (§7)", async () => {
    const ana = await crearUsuario();
    const beto = await crearUsuario();

    // Beto intenta crear una cuenta a nombre de Ana.
    await beto.post("/api/accounts", {
      userId: ana.userId,
      name: "Infiltrada",
      type: "CASH",
      balance: 0,
      colorHex: "#FF0000",
      iconName: "Payments",
      includeInTotal: true,
    });

    const deAna = await ana.json<Account[]>(await ana.get("/api/accounts"));
    const deBeto = await beto.json<Account[]>(await beto.get("/api/accounts"));

    expect(deAna.map((c) => c.name)).not.toContain("Infiltrada");
    expect(deBeto.map((c) => c.name)).toContain("Infiltrada");
  });
});
