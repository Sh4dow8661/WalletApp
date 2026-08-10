import { beforeEach, describe, expect, it } from "vitest";

import { dateInputToMillis } from "../../src/lib/dates.ts";
import type { Account, Category, Transaction } from "../../src/shared/types.ts";

import { type Cliente, crearUsuario, esperarEstado } from "./helpers.ts";

/**
 * Duplicar transacciones.
 *
 * Lo delicado son las transferencias: duplicar una pata suelta dejaría las
 * cuentas descuadradas, que es exactamente el bug de §8.2.
 */

const TZ = "America/Puerto_Rico";
const dia = (iso: string) => dateInputToMillis(iso, TZ);

let cliente: Cliente;
let efectivo: Account;
let banco: Account;
let comida: Category;

const transacciones = async () =>
  cliente.json<Transaction[]>(await cliente.get("/api/transactions"));

const saldoDe = async (id: string) => {
  const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));
  return cuentas.find((c) => c.id === id)!.currentBalance;
};

const duplicar = (ids: string[], fecha: string) =>
  cliente.post("/api/transactions/duplicate", { ids, date: dia(fecha) });

beforeEach(async () => {
  cliente = await crearUsuario();
  const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));
  [efectivo, banco] = cuentas as [Account, Account];
  const cats = await cliente.json<Category[]>(await cliente.get("/api/categories"));
  comida = cats.find((c) => c.name === "Comida" && c.type === "EXPENSE")!;
});

describe("duplicar un gasto", () => {
  it("crea una copia con id nuevo y NO toca la original", async () => {
    await cliente.post("/api/transactions", {
      amount: 45.9,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: dia("2026-03-10"),
      note: "Supermercado",
    });
    const [original] = await transacciones();

    esperarEstado(await duplicar([original!.id], "2026-08-10"), 201);

    const todas = await transacciones();
    expect(todas).toHaveLength(2);

    // La original sigue intacta, con su fecha y su id.
    const sigueIgual = todas.find((t) => t.id === original!.id)!;
    expect(sigueIgual.date).toBe(dia("2026-03-10"));
    expect(sigueIgual.amount).toBe(45.9);

    // La copia es otra fila, con la fecha pedida y los mismos datos.
    const copia = todas.find((t) => t.id !== original!.id)!;
    expect(copia.id).not.toBe(original!.id);
    expect(copia.date).toBe(dia("2026-08-10"));
    expect(copia.amount).toBe(45.9);
    expect(copia.note).toBe("Supermercado");
    expect(copia.categoryId).toBe(comida.id);
    expect(copia.accountId).toBe(efectivo.id);
  });

  it("la copia afecta al saldo como cualquier otro gasto", async () => {
    await cliente.post("/api/transactions", {
      amount: 100,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: dia("2026-03-10"),
    });
    const [original] = await transacciones();
    const antes = await saldoDe(efectivo.id);

    await duplicar([original!.id], "2026-08-10");

    expect(await saldoDe(efectivo.id)).toBe(antes - 100);
  });
});

describe("duplicar una transferencia", () => {
  async function crearTransferencia() {
    await cliente.post("/api/transactions", {
      amount: 200,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: banco.id,
      date: dia("2026-03-10"),
    });
    return transacciones();
  }

  it("crea el PAR completo con un grupo nuevo, no una pata suelta", async () => {
    const original = await crearTransferencia();
    const saliente = original.find((t) => t.isOutgoing)!;

    esperarEstado(await duplicar([saliente.id], "2026-08-10"), 201);

    const todas = await transacciones();
    const copias = todas.filter((t) => t.date === dia("2026-08-10"));

    // Dos patas, no una.
    expect(copias).toHaveLength(2);
    expect(copias.filter((t) => t.isOutgoing)).toHaveLength(1);
    expect(copias.filter((t) => !t.isOutgoing)).toHaveLength(1);

    // Con un grupo nuevo, distinto del original y compartido por las dos.
    const grupos = new Set(copias.map((t) => t.transferGroupId));
    expect(grupos.size).toBe(1);
    expect([...grupos][0]).not.toBe(saliente.transferGroupId);
    expect([...grupos][0]).not.toBeNull();

    // Y las cuentas cruzadas en el sentido correcto.
    const nuevaSaliente = copias.find((t) => t.isOutgoing)!;
    expect(nuevaSaliente.accountId).toBe(efectivo.id);
    expect(nuevaSaliente.transferAccountId).toBe(banco.id);
  });

  it("duplicar desde la pata ENTRANTE da el mismo par, no uno invertido", async () => {
    const original = await crearTransferencia();
    const entrante = original.find((t) => !t.isOutgoing)!;

    await duplicar([entrante.id], "2026-08-10");

    const copias = (await transacciones()).filter((t) => t.date === dia("2026-08-10"));
    const nuevaSaliente = copias.find((t) => t.isOutgoing)!;

    // El dinero sale de donde salía: de efectivo a banco.
    expect(nuevaSaliente.accountId).toBe(efectivo.id);
    expect(nuevaSaliente.transferAccountId).toBe(banco.id);
  });

  it("seleccionar las DOS patas duplica una sola vez", async () => {
    // Sin deduplicar por grupo, marcar "todo" en la lista crearía el doble de
    // transferencias.
    const original = await crearTransferencia();

    await duplicar(
      original.map((t) => t.id),
      "2026-08-10",
    );

    const copias = (await transacciones()).filter((t) => t.date === dia("2026-08-10"));
    expect(copias).toHaveLength(2);
  });

  it("la copia deja los saldos cuadrados", async () => {
    const original = await crearTransferencia();
    const saliente = original.find((t) => t.isOutgoing)!;

    const efectivoAntes = await saldoDe(efectivo.id);
    const bancoAntes = await saldoDe(banco.id);

    await duplicar([saliente.id], "2026-08-10");

    expect(await saldoDe(efectivo.id)).toBe(efectivoAntes - 200);
    expect(await saldoDe(banco.id)).toBe(bancoAntes + 200);
  });
});

describe("duplicar varias a la vez", () => {
  it("copia todas a la fecha elegida", async () => {
    for (const monto of [10, 20, 30]) {
      await cliente.post("/api/transactions", {
        amount: monto,
        type: "EXPENSE",
        accountId: efectivo.id,
        categoryId: comida.id,
        date: dia("2026-03-10"),
      });
    }
    const originales = await transacciones();

    esperarEstado(
      await duplicar(
        originales.map((t) => t.id),
        "2026-08-10",
      ),
      201,
    );

    const copias = (await transacciones()).filter((t) => t.date === dia("2026-08-10"));
    expect(copias).toHaveLength(3);
    expect(copias.map((t) => t.amount).sort((a, b) => a - b)).toEqual([10, 20, 30]);
  });
});

describe("validación", () => {
  it("rechaza una lista vacía", async () => {
    esperarEstado(await duplicar([], "2026-08-10"), 400);
  });

  it("rechaza identificadores inválidos", async () => {
    esperarEstado(
      await cliente.post("/api/transactions/duplicate", {
        ids: ["no-es-un-uuid"],
        date: dia("2026-08-10"),
      }),
      400,
    );
  });

  it("da 404 si no existe ninguna de las transacciones pedidas", async () => {
    esperarEstado(
      await duplicar(["01900000-0000-7000-8000-000000000000"], "2026-08-10"),
      404,
    );
  });

  it("no duplica transacciones de otro usuario", async () => {
    await cliente.post("/api/transactions", {
      amount: 50,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: dia("2026-03-10"),
    });
    const [mia] = await transacciones();

    // Otro usuario intenta duplicar la transacción del primero.
    const intruso = await crearUsuario();
    const respuesta = await intruso.post("/api/transactions/duplicate", {
      ids: [mia!.id],
      date: dia("2026-08-10"),
    });

    esperarEstado(respuesta, 404);
    expect(await transacciones()).toHaveLength(1);
  });
});
