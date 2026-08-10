import { beforeEach, describe, expect, it } from "vitest";

import type { Account, Category, Transaction } from "../../src/shared/types.ts";

import { type Cliente, crearUsuario, esperarEstado } from "./helpers.ts";

/**
 * Transferencias — el bug de §8.2 y su corrección.
 *
 * En la app Android, `AddEditTransactionViewModel.save()` solo creaba la fila
 * entrante cuando `id == 0`, así que al **editar** una transferencia se
 * actualizaba únicamente la saliente y los balances se descuadraban en
 * silencio. Lo mismo al borrar: se iba una sola pata.
 *
 * Aquí las dos filas comparten `transfer_group_id` y toda operación va sobre el
 * grupo entero dentro de un único batch de D1.
 *
 * El criterio de aceptación de §14 es literalmente "editar una transferencia
 * mantiene cuadrados los balances de ambas cuentas"; ese es el test central de
 * este archivo.
 */

let cliente: Cliente;
let efectivo: Account;
let banco: Account;
let tarjeta: Account;
let comida: Category;

/** Suma de los balances de todas las cuentas del usuario. */
async function patrimonio(): Promise<number> {
  const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));
  return cuentas.reduce((total, c) => total + c.currentBalance, 0);
}

async function saldoDe(id: string): Promise<number> {
  const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));
  return cuentas.find((c) => c.id === id)!.currentBalance;
}

async function transacciones(): Promise<Transaction[]> {
  return cliente.json<Transaction[]>(await cliente.get("/api/transactions"));
}

beforeEach(async () => {
  cliente = await crearUsuario();

  const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));
  [efectivo, banco, tarjeta] = cuentas as [Account, Account, Account];

  const categorias = await cliente.json<Category[]>(await cliente.get("/api/categories"));
  comida = categorias.find((c) => c.name === "Comida")!;

  // Se parte de saldos conocidos para que las cuentas sean fáciles de seguir.
  for (const [cuenta, saldo] of [
    [efectivo, 1000],
    [banco, 2000],
    [tarjeta, 0],
  ] as const) {
    await esperarEstado(
      await cliente.put(`/api/accounts/${cuenta.id}`, {
        name: cuenta.name,
        type: cuenta.type,
        balance: saldo,
        colorHex: cuenta.colorHex,
        iconName: cuenta.iconName,
        includeInTotal: cuenta.includeInTotal,
      }),
      200,
    );
  }
});

describe("crear una transferencia", () => {
  it("genera dos filas con el mismo grupo y cuentas cruzadas", async () => {
    await esperarEstado(
      await cliente.post("/api/transactions", {
        amount: 300,
        type: "TRANSFER",
        accountId: efectivo.id,
        transferAccountId: banco.id,
        date: Date.now(),
        note: "Ingreso al banco",
      }),
      201,
    );

    const filas = await transacciones();
    expect(filas).toHaveLength(2);

    const saliente = filas.find((t) => t.isOutgoing)!;
    const entrante = filas.find((t) => !t.isOutgoing)!;

    expect(saliente.transferGroupId).toBeTruthy();
    expect(entrante.transferGroupId).toBe(saliente.transferGroupId);

    expect(saliente.accountId).toBe(efectivo.id);
    expect(saliente.transferAccountId).toBe(banco.id);
    expect(entrante.accountId).toBe(banco.id);
    expect(entrante.transferAccountId).toBe(efectivo.id);

    // Sin categoría y sin presupuestos, nunca.
    expect(saliente.categoryId).toBeNull();
    expect(entrante.categoryId).toBeNull();
    expect(saliente.budgetIds).toEqual([]);
    expect(entrante.budgetIds).toEqual([]);
  });

  it("mueve el dinero sin cambiar el patrimonio total", async () => {
    expect(await patrimonio()).toBe(3000);

    await cliente.post("/api/transactions", {
      amount: 300,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: banco.id,
      date: Date.now(),
    });

    expect(await saldoDe(efectivo.id)).toBe(700);
    expect(await saldoDe(banco.id)).toBe(2300);
    expect(await patrimonio()).toBe(3000);
  });

  it("rechaza una transferencia a la misma cuenta", async () => {
    const respuesta = await cliente.post("/api/transactions", {
      amount: 100,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: efectivo.id,
      date: Date.now(),
    });
    expect(respuesta.status).toBe(400);
    expect(await transacciones()).toHaveLength(0);
  });

  it("rechaza una transferencia sin cuenta destino", async () => {
    const respuesta = await cliente.post("/api/transactions", {
      amount: 100,
      type: "TRANSFER",
      accountId: efectivo.id,
      date: Date.now(),
    });
    expect(respuesta.status).toBe(400);
  });
});

describe("editar una transferencia — criterio de aceptación de §14", () => {
  it("al cambiar el importe, los balances de AMBAS cuentas siguen cuadrando", async () => {
    await cliente.post("/api/transactions", {
      amount: 300,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: banco.id,
      date: Date.now(),
    });

    const saliente = (await transacciones()).find((t) => t.isOutgoing)!;

    // Aquí es exactamente donde fallaba la app Android: la fila entrante se
    // quedaba con el importe viejo.
    await esperarEstado(
      await cliente.put(`/api/transactions/${saliente.id}`, {
        amount: 450,
        type: "TRANSFER",
        accountId: efectivo.id,
        transferAccountId: banco.id,
        date: saliente.date,
      }),
      200,
    );

    const filas = await transacciones();
    expect(filas).toHaveLength(2);
    expect(filas.every((t) => t.amount === 450)).toBe(true);

    expect(await saldoDe(efectivo.id)).toBe(550); // 1000 − 450
    expect(await saldoDe(banco.id)).toBe(2450); // 2000 + 450
    expect(await patrimonio()).toBe(3000); // el total no se movió
  });

  it("al cambiar la fecha, las dos patas se mueven juntas", async () => {
    const fechaVieja = Date.UTC(2026, 4, 10, 12);
    const fechaNueva = Date.UTC(2026, 6, 20, 12);

    await cliente.post("/api/transactions", {
      amount: 200,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: banco.id,
      date: fechaVieja,
    });

    const saliente = (await transacciones()).find((t) => t.isOutgoing)!;
    await cliente.put(`/api/transactions/${saliente.id}`, {
      amount: 200,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: banco.id,
      date: fechaNueva,
    });

    const filas = await transacciones();
    expect(filas.map((t) => t.date)).toEqual([fechaNueva, fechaNueva]);
  });

  it("al cambiar las cuentas, el dinero se mueve entre las nuevas", async () => {
    await cliente.post("/api/transactions", {
      amount: 500,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: banco.id,
      date: Date.now(),
    });

    const saliente = (await transacciones()).find((t) => t.isOutgoing)!;

    // Ahora va del banco a la tarjeta: el efectivo debe recuperar su saldo.
    await cliente.put(`/api/transactions/${saliente.id}`, {
      amount: 500,
      type: "TRANSFER",
      accountId: banco.id,
      transferAccountId: tarjeta.id,
      date: saliente.date,
    });

    expect(await saldoDe(efectivo.id)).toBe(1000);
    expect(await saldoDe(banco.id)).toBe(1500);
    expect(await saldoDe(tarjeta.id)).toBe(500);
    expect(await patrimonio()).toBe(3000);
  });

  it("editar desde la pata ENTRANTE también cuadra", async () => {
    // La UI permite abrir cualquiera de las dos filas.
    await cliente.post("/api/transactions", {
      amount: 300,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: banco.id,
      date: Date.now(),
    });

    const entrante = (await transacciones()).find((t) => !t.isOutgoing)!;

    await esperarEstado(
      await cliente.put(`/api/transactions/${entrante.id}`, {
        amount: 700,
        type: "TRANSFER",
        accountId: efectivo.id,
        transferAccountId: banco.id,
        date: entrante.date,
      }),
      200,
    );

    const filas = await transacciones();
    expect(filas).toHaveLength(2);
    expect(filas.every((t) => t.amount === 700)).toBe(true);
    expect(await saldoDe(efectivo.id)).toBe(300);
    expect(await saldoDe(banco.id)).toBe(2700);
    expect(await patrimonio()).toBe(3000);
  });

  it("aguanta ediciones repetidas sin acumular descuadre", async () => {
    await cliente.post("/api/transactions", {
      amount: 100,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: banco.id,
      date: Date.now(),
    });

    for (const importe of [250, 375.5, 12.25, 900]) {
      const saliente = (await transacciones()).find((t) => t.isOutgoing)!;
      await cliente.put(`/api/transactions/${saliente.id}`, {
        amount: importe,
        type: "TRANSFER",
        accountId: efectivo.id,
        transferAccountId: banco.id,
        date: saliente.date,
      });

      expect(await saldoDe(efectivo.id)).toBeCloseTo(1000 - importe, 10);
      expect(await saldoDe(banco.id)).toBeCloseTo(2000 + importe, 10);
      expect(await patrimonio()).toBeCloseTo(3000, 10);
      expect(await transacciones()).toHaveLength(2);
    }
  });
});

describe("borrar una transferencia", () => {
  it("se lleva las DOS patas y devuelve los saldos", async () => {
    await cliente.post("/api/transactions", {
      amount: 400,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: banco.id,
      date: Date.now(),
    });

    const saliente = (await transacciones()).find((t) => t.isOutgoing)!;
    await esperarEstado(await cliente.del(`/api/transactions/${saliente.id}`), 200);

    // En Android quedaba viva la pata entrante, inflando el banco para siempre.
    expect(await transacciones()).toHaveLength(0);
    expect(await saldoDe(efectivo.id)).toBe(1000);
    expect(await saldoDe(banco.id)).toBe(2000);
    expect(await patrimonio()).toBe(3000);
  });

  it("borrar desde la pata entrante también se lleva las dos", async () => {
    await cliente.post("/api/transactions", {
      amount: 400,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: banco.id,
      date: Date.now(),
    });

    const entrante = (await transacciones()).find((t) => !t.isOutgoing)!;
    await cliente.del(`/api/transactions/${entrante.id}`);

    expect(await transacciones()).toHaveLength(0);
    expect(await patrimonio()).toBe(3000);
  });
});

describe("cambiar el tipo de una transacción", () => {
  it("de transferencia a gasto: la pata hermana desaparece", async () => {
    await cliente.post("/api/transactions", {
      amount: 300,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: banco.id,
      date: Date.now(),
    });

    const saliente = (await transacciones()).find((t) => t.isOutgoing)!;

    await esperarEstado(
      await cliente.put(`/api/transactions/${saliente.id}`, {
        amount: 300,
        type: "EXPENSE",
        accountId: efectivo.id,
        categoryId: comida.id,
        date: saliente.date,
      }),
      200,
    );

    const filas = await transacciones();
    // Si la hermana sobreviviera, el banco se quedaría +300 para siempre: es el
    // tercer agravante del bug de §8.2 que la app Android no cubría.
    expect(filas).toHaveLength(1);
    expect(filas[0]!.type).toBe("EXPENSE");
    expect(filas[0]!.transferGroupId).toBeNull();

    expect(await saldoDe(efectivo.id)).toBe(700);
    expect(await saldoDe(banco.id)).toBe(2000);
    expect(await patrimonio()).toBe(2700); // el gasto sí sale del patrimonio
  });

  it("de gasto a transferencia: aparece la pata entrante", async () => {
    await cliente.post("/api/transactions", {
      amount: 250,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: Date.now(),
    });

    const gasto = (await transacciones())[0]!;

    await esperarEstado(
      await cliente.put(`/api/transactions/${gasto.id}`, {
        amount: 250,
        type: "TRANSFER",
        accountId: efectivo.id,
        transferAccountId: banco.id,
        date: gasto.date,
      }),
      200,
    );

    const filas = await transacciones();
    expect(filas).toHaveLength(2);
    expect(filas.every((t) => t.type === "TRANSFER")).toBe(true);
    expect(new Set(filas.map((t) => t.transferGroupId)).size).toBe(1);
    expect(filas.every((t) => t.categoryId === null)).toBe(true);

    expect(await saldoDe(efectivo.id)).toBe(750);
    expect(await saldoDe(banco.id)).toBe(2250);
    expect(await patrimonio()).toBe(3000); // ya no es un gasto
  });
});
