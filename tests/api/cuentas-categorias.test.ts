import { beforeEach, describe, expect, it } from "vitest";

import type { Account, Category, Transaction } from "../../src/shared/types.ts";

import { type Cliente, crearUsuario, esperarEstado } from "./helpers.ts";

/** Reglas de cuentas y categorías: §8.1, §8.3 y las cascadas de §8.7. */

let cliente: Cliente;
let efectivo: Account;
let banco: Account;
let comida: Category;
let salario: Category;

const cuentas = async () => cliente.json<Account[]>(await cliente.get("/api/accounts"));
const categorias = async () =>
  cliente.json<Category[]>(await cliente.get("/api/categories"));
const movimientos = async () =>
  cliente.json<Transaction[]>(await cliente.get("/api/transactions"));

const saldoDe = async (id: string) =>
  (await cuentas()).find((c) => c.id === id)!.currentBalance;

/** Edita una cuenta manteniendo el resto de campos. */
async function editarCuenta(
  cuenta: Account,
  cambios: Partial<Account> & { balance: number },
) {
  return cliente.put(`/api/accounts/${cuenta.id}`, {
    name: cambios.name ?? cuenta.name,
    type: cambios.type ?? cuenta.type,
    balance: cambios.balance,
    colorHex: cambios.colorHex ?? cuenta.colorHex,
    iconName: cambios.iconName ?? cuenta.iconName,
    includeInTotal: cambios.includeInTotal ?? cuenta.includeInTotal,
  });
}

beforeEach(async () => {
  cliente = await crearUsuario();
  const lista = await cuentas();
  [efectivo, banco] = lista as [Account, Account];
  const cats = await categorias();
  comida = cats.find((c) => c.name === "Comida" && c.type === "EXPENSE")!;
  salario = cats.find((c) => c.name === "Salario")!;
});

describe("balance de una cuenta (§8.1)", () => {
  it("suma ingresos y resta gastos sobre el balance inicial", async () => {
    await editarCuenta(efectivo, { balance: 500 });

    await cliente.post("/api/transactions", {
      amount: 200,
      type: "INCOME",
      accountId: efectivo.id,
      categoryId: salario.id,
      date: Date.now(),
    });
    await cliente.post("/api/transactions", {
      amount: 80,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: Date.now(),
    });

    expect(await saldoDe(efectivo.id)).toBe(620); // 500 + 200 − 80
  });

  it("excluye del total las cuentas con includeInTotal en falso", async () => {
    await editarCuenta(efectivo, { balance: 1000 });
    await editarCuenta(banco, { balance: 5000, includeInTotal: false });

    const resumen = await cliente.json<{ totalBalance: number }>(
      await cliente.get("/api/stats/dashboard"),
    );

    // El banco sigue teniendo su saldo, pero no cuenta para el total.
    expect(await saldoDe(banco.id)).toBe(5000);
    expect(resumen.totalBalance).toBe(1000);
  });
});

describe("editar el balance actual de una cuenta (§8.3)", () => {
  it("al CREAR, el campo balance es el balance inicial", async () => {
    const respuesta = await esperarEstado(
      await cliente.post("/api/accounts", {
        name: "Ahorros",
        type: "BANK",
        balance: 750,
        colorHex: "#2196F3",
        iconName: "AccountBalance",
        includeInTotal: true,
      }),
      201,
    );

    const { id } = await cliente.json<{ id: string }>(respuesta);
    const creada = (await cuentas()).find((c) => c.id === id)!;
    expect(creada.initialBalance).toBe(750);
    expect(creada.currentBalance).toBe(750);
  });

  it("al EDITAR, el campo balance es el balance ACTUAL deseado", async () => {
    await editarCuenta(efectivo, { balance: 1000 });

    // Con movimientos por medio: +300 de ingreso, −100 de gasto → neto +200.
    await cliente.post("/api/transactions", {
      amount: 300,
      type: "INCOME",
      accountId: efectivo.id,
      categoryId: salario.id,
      date: Date.now(),
    });
    await cliente.post("/api/transactions", {
      amount: 100,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: Date.now(),
    });
    expect(await saldoDe(efectivo.id)).toBe(1200);

    // El usuario cuadra la cuenta contra su saldo real: teclea 950.
    await esperarEstado(await editarCuenta(efectivo, { balance: 950 }), 200);

    const despues = (await cuentas()).find((c) => c.id === efectivo.id)!;
    expect(despues.currentBalance).toBe(950); // lo que se tecleó
    expect(despues.initialBalance).toBe(750); // 950 − 200, despejado por el servidor
  });

  it("cuadrar no altera las transacciones existentes", async () => {
    await cliente.post("/api/transactions", {
      amount: 42,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: Date.now(),
    });

    await editarCuenta(efectivo, { balance: 300 });

    const filas = await movimientos();
    expect(filas).toHaveLength(1);
    expect(filas[0]!.amount).toBe(42);
    expect(await saldoDe(efectivo.id)).toBe(300);
  });

  it("no se fía del delta que mande el cliente", async () => {
    await cliente.post("/api/transactions", {
      amount: 100,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: Date.now(),
    });

    // Se cuela un `initialBalance` inventado en el cuerpo.
    await cliente.put(`/api/accounts/${efectivo.id}`, {
      name: efectivo.name,
      type: efectivo.type,
      balance: 500,
      initialBalance: 999999,
      colorHex: efectivo.colorHex,
      iconName: efectivo.iconName,
      includeInTotal: true,
    });

    const despues = (await cuentas()).find((c) => c.id === efectivo.id)!;
    expect(despues.currentBalance).toBe(500);
    expect(despues.initialBalance).toBe(600); // 500 + 100, calculado en el servidor
  });
});

describe("borrar una cuenta arrastra sus transacciones (§8.7)", () => {
  it("las transacciones de la cuenta desaparecen con ella", async () => {
    await cliente.post("/api/transactions", {
      amount: 50,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: Date.now(),
    });
    await cliente.post("/api/transactions", {
      amount: 70,
      type: "EXPENSE",
      accountId: banco.id,
      categoryId: comida.id,
      date: Date.now(),
    });
    expect(await movimientos()).toHaveLength(2);

    await esperarEstado(await cliente.del(`/api/accounts/${efectivo.id}`), 200);

    const restantes = await movimientos();
    expect(restantes).toHaveLength(1);
    expect(restantes[0]!.accountId).toBe(banco.id);
    expect((await cuentas()).map((c) => c.id)).not.toContain(efectivo.id);
  });

  it("también se lleva las transferencias en las que la cuenta era destino", async () => {
    // Sin esto, la pata de la otra cuenta quedaría apuntando a una cuenta que ya
    // no existe y seguiría sumando a su balance.
    await cliente.post("/api/transactions", {
      amount: 200,
      type: "TRANSFER",
      accountId: banco.id,
      transferAccountId: efectivo.id,
      date: Date.now(),
    });
    expect(await movimientos()).toHaveLength(2);

    await cliente.del(`/api/accounts/${efectivo.id}`);

    expect(await movimientos()).toHaveLength(0);
  });
});

describe("borrar una categoría deja las transacciones sin categoría (§8.7)", () => {
  it("la transacción sobrevive, pero sin categoría", async () => {
    await cliente.post("/api/transactions", {
      amount: 60,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: Date.now(),
    });

    await esperarEstado(await cliente.del(`/api/categories/${comida.id}`), 200);

    const filas = await movimientos();
    // A diferencia de las cuentas, borrar una categoría NO borra el gasto: solo
    // lo deja sin clasificar, y sigue contando en los totales.
    expect(filas).toHaveLength(1);
    expect(filas[0]!.categoryId).toBeNull();
    expect(filas[0]!.amount).toBe(60);
    expect(await saldoDe(efectivo.id)).toBe(-60);
  });

  it("la categoría borrada deja de listarse", async () => {
    await cliente.del(`/api/categories/${comida.id}`);
    const restantes = await categorias();
    expect(restantes).toHaveLength(13);
    expect(restantes.map((c) => c.id)).not.toContain(comida.id);
  });
});

describe("validación de entrada", () => {
  it("rechaza un color que no es #RRGGBB", async () => {
    const respuesta = await cliente.post("/api/accounts", {
      name: "Mala",
      type: "CASH",
      balance: 0,
      colorHex: "rojo",
      iconName: "Payments",
      includeInTotal: true,
    });
    expect(respuesta.status).toBe(400);
    const cuerpo = await cliente.json<{ fields: Record<string, string> }>(respuesta);
    expect(cuerpo.fields).toHaveProperty("colorHex");
  });

  it("rechaza un tipo de cuenta fuera del CHECK del esquema", async () => {
    const respuesta = await cliente.post("/api/accounts", {
      name: "Mala",
      type: "CRIPTO",
      balance: 0,
      colorHex: "#FF0000",
      iconName: "Payments",
      includeInTotal: true,
    });
    expect(respuesta.status).toBe(400);
  });

  it("rechaza un nombre vacío", async () => {
    const respuesta = await cliente.post("/api/accounts", {
      name: "   ",
      type: "CASH",
      balance: 0,
      colorHex: "#FF0000",
      iconName: "Payments",
      includeInTotal: true,
    });
    expect(respuesta.status).toBe(400);
  });

  it("rechaza importes no positivos y valores no finitos", async () => {
    for (const amount of [0, -50]) {
      const respuesta = await cliente.post("/api/transactions", {
        amount,
        type: "EXPENSE",
        accountId: efectivo.id,
        categoryId: comida.id,
        date: Date.now(),
      });
      expect(respuesta.status, `amount=${amount}`).toBe(400);
    }
  });

  it("rechaza un id con forma inválida", async () => {
    const respuesta = await cliente.post("/api/transactions", {
      id: "'; DROP TABLE transactions;--",
      amount: 10,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: Date.now(),
    });
    expect(respuesta.status).toBe(400);
    // Y la tabla sigue ahí.
    expect((await cliente.get("/api/transactions")).status).toBe(200);
  });

  it("rechaza un gasto sin categoría", async () => {
    const respuesta = await cliente.post("/api/transactions", {
      amount: 10,
      type: "EXPENSE",
      accountId: efectivo.id,
      date: Date.now(),
    });
    expect(respuesta.status).toBe(400);
  });

  it("rechaza una cuenta que no existe", async () => {
    const respuesta = await cliente.post("/api/transactions", {
      amount: 10,
      type: "EXPENSE",
      accountId: "0198f3a1-2b4c-7d8e-9f01-234567890abc",
      categoryId: comida.id,
      date: Date.now(),
    });
    expect(respuesta.status).toBe(400);
  });
});
