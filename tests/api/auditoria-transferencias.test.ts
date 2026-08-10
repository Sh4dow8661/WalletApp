import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { Account, Category, Transaction } from "../../src/shared/types.ts";

import { type Cliente, crearUsuario, esperarEstado } from "./helpers.ts";

/**
 * AUDITORÍA del ciclo de vida de una transferencia (petición 5).
 *
 * `transferencias.test.ts` ya cubre crear, editar importe/fecha/cuentas, borrar
 * y cambiar de tipo. Este archivo NO repite aquello: cubre los huecos que
 * quedaban y, sobre todo, el hueco del esquema —`account_id` con ON DELETE
 * CASCADE frente a `transfer_account_id` con ON DELETE SET NULL— para dejar por
 * escrito, con una prueba, si es alcanzable o no.
 */

let cliente: Cliente;
let efectivo: Account;
let banco: Account;
let tarjeta: Account;
let comida: Category;

const cuentas = async () => cliente.json<Account[]>(await cliente.get("/api/accounts"));
const transacciones = async () =>
  cliente.json<Transaction[]>(await cliente.get("/api/transactions"));

const saldoDe = async (id: string) =>
  (await cuentas()).find((c) => c.id === id)?.currentBalance ?? 0;

/**
 * Crea una transferencia y devuelve sus dos patas, la saliente primero.
 *
 * El orden se fija aquí a propósito: `/api/transactions` no garantiza cuál de
 * las dos filas viene antes, y confundirlas hace que un test "falle" por editar
 * la pata que no era, no por un fallo del código.
 */
async function crearTransferencia(origen: string, destino: string, amount = 200) {
  esperarEstado(
    await cliente.post("/api/transactions", {
      amount,
      type: "TRANSFER",
      accountId: origen,
      transferAccountId: destino,
      date: Date.now(),
    }),
    201,
  );

  const patas = (await transacciones()).filter((t) => t.type === "TRANSFER");
  const saliente = patas.find((t) => t.isOutgoing)!;
  const entrante = patas.find((t) => !t.isOutgoing)!;
  return [saliente, entrante] as const;
}

/** Edita una transferencia conservando lo que no se cambia. */
async function editar(tx: Transaction, cambios: Partial<Transaction>) {
  return cliente.put(`/api/transactions/${tx.id}`, {
    amount: cambios.amount ?? tx.amount,
    type: "TRANSFER",
    accountId: cambios.accountId ?? tx.accountId,
    transferAccountId: cambios.transferAccountId ?? tx.transferAccountId,
    date: cambios.date ?? tx.date,
    note: cambios.note ?? tx.note,
  });
}

beforeEach(async () => {
  cliente = await crearUsuario();
  const lista = await cuentas();
  [efectivo, banco, tarjeta] = lista as [Account, Account, Account];
  const cats = await cliente.json<Category[]>(await cliente.get("/api/categories"));
  comida = cats.find((c) => c.name === "Comida" && c.type === "EXPENSE")!;
});

describe("cambiar UNA sola de las dos cuentas", () => {
  it("cambiar solo el ORIGEN mueve el dinero desde la nueva cuenta", async () => {
    const [saliente] = await crearTransferencia(efectivo.id, banco.id);

    // efectivo −200, banco +200. Ahora el origen pasa a ser la tarjeta.
    esperarEstado(await editar(saliente!, { accountId: tarjeta.id }), 200);

    expect(await saldoDe(efectivo.id)).toBe(0); // devuelto
    expect(await saldoDe(tarjeta.id)).toBe(-200); // ahora sale de aquí
    expect(await saldoDe(banco.id)).toBe(200); // el destino no cambia

    // Y sigue habiendo exactamente dos patas, con el mismo grupo.
    const patas = (await transacciones()).filter((t) => t.type === "TRANSFER");
    expect(patas).toHaveLength(2);
    expect(new Set(patas.map((t) => t.transferGroupId)).size).toBe(1);
  });

  it("cambiar solo el DESTINO deja el origen intacto", async () => {
    const [saliente] = await crearTransferencia(efectivo.id, banco.id);

    esperarEstado(await editar(saliente!, { transferAccountId: tarjeta.id }), 200);

    expect(await saldoDe(efectivo.id)).toBe(-200);
    expect(await saldoDe(banco.id)).toBe(0); // devuelto
    expect(await saldoDe(tarjeta.id)).toBe(200);
  });

  it("intercambiar origen y destino invierte el sentido sin dejar restos", async () => {
    const [saliente] = await crearTransferencia(efectivo.id, banco.id);

    esperarEstado(
      await editar(saliente!, { accountId: banco.id, transferAccountId: efectivo.id }),
      200,
    );

    expect(await saldoDe(banco.id)).toBe(-200);
    expect(await saldoDe(efectivo.id)).toBe(200);
    expect((await transacciones()).filter((t) => t.type === "TRANSFER")).toHaveLength(2);
  });
});

describe("borrar la cuenta de una transferencia", () => {
  it("se lleva las DOS patas, no solo la de esa cuenta", async () => {
    await crearTransferencia(efectivo.id, banco.id);

    esperarEstado(await cliente.del(`/api/accounts/${efectivo.id}`), 200);

    // Ninguna pata sobrevive: ni la de la cuenta borrada ni la de la otra.
    expect(await transacciones()).toHaveLength(0);
  });

  it("el saldo de la cuenta que SOBREVIVE vuelve a su sitio", async () => {
    await crearTransferencia(efectivo.id, banco.id);
    expect(await saldoDe(banco.id)).toBe(200);

    await cliente.del(`/api/accounts/${efectivo.id}`);

    // Si la pata entrante hubiera sobrevivido, banco se quedaría con +200
    // inflado para siempre: es el bug de §8.2 por la puerta de atrás.
    expect(await saldoDe(banco.id)).toBe(0);
  });

  it("borrar la cuenta DESTINO también se lleva las dos patas", async () => {
    await crearTransferencia(efectivo.id, banco.id);

    await cliente.del(`/api/accounts/${banco.id}`);

    expect(await transacciones()).toHaveLength(0);
    expect(await saldoDe(efectivo.id)).toBe(0);
  });
});

describe("el hueco del esquema: CASCADE frente a SET NULL", () => {
  it("el borrado por API es LÓGICO: la fila de la cuenta sigue en la tabla", async () => {
    await cliente.del(`/api/accounts/${efectivo.id}`);

    const fila = await env.DB.prepare(
      "SELECT id, deleted_at FROM wallet_accounts WHERE id = ?",
    )
      .bind(efectivo.id)
      .first<{ id: string; deleted_at: number | null }>();

    // Existe, solo marcada. Por eso las claves foráneas NO se disparan.
    expect(fila).not.toBeNull();
    expect(fila!.deleted_at).not.toBeNull();
  });

  it("un borrado FÍSICO sí partiría la transferencia — por eso no se hace", async () => {
    const [, entrante] = await crearTransferencia(efectivo.id, banco.id);

    // Se salta el API a propósito para provocar lo que describe la petición.
    await env.DB.prepare("DELETE FROM wallet_accounts WHERE id = ?")
      .bind(efectivo.id)
      .run();

    const superviviente = await env.DB.prepare(
      "SELECT id, transfer_account_id FROM transactions WHERE id = ?",
    )
      .bind(entrante.id)
      .first<{ id: string; transfer_account_id: string | null }>();

    const borrada = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?",
    )
      .bind(efectivo.id)
      .first<{ n: number }>();

    // Queda documentado el comportamiento real del esquema: la pata de la
    // cuenta borrada desaparece (CASCADE) y la otra sobrevive con el destino a
    // NULL (SET NULL), convertida en una transferencia a ninguna parte.
    expect(borrada!.n).toBe(0);
    expect(superviviente).not.toBeNull();
    expect(superviviente!.transfer_account_id).toBeNull();
  });

  it("NINGUNA ruta del API borra cuentas físicamente", async () => {
    // La garantía de que lo anterior no ocurra en producción. Si alguien añade
    // un borrado físico de cuentas sin borrar antes sus transacciones, este
    // test es el que debe hacérselo notar.
    await crearTransferencia(efectivo.id, banco.id);

    esperarEstado(await cliente.del(`/api/accounts/${efectivo.id}`), 200);

    const cuantas = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM wallet_accounts WHERE user_id = ?",
    )
      .bind(cliente.userId)
      .first<{ n: number }>();

    // Las tres cuentas sembradas siguen ahí, ninguna se borró de verdad.
    expect(cuantas!.n).toBe(3);
  });

  it("al importar, las transacciones se borran ANTES que las cuentas", async () => {
    // El único borrado físico de cuentas de todo el código está en la
    // importación, y ahí no puede dejar patas sueltas porque cuando se borran
    // las cuentas ya no queda ninguna transacción.
    await crearTransferencia(efectivo.id, banco.id);

    const respaldo = await cliente.get("/api/data/json");
    esperarEstado(respaldo, 200);
    const contenido = await respaldo.text();

    esperarEstado(
      await cliente.postRaw("/api/data/json", contenido, "application/json"),
      200,
    );

    // Tras reemplazarlo todo no queda ninguna transacción sin cuenta.
    const sueltas = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM transactions t
        WHERE t.user_id = ?
          AND t.account_id NOT IN (SELECT id FROM wallet_accounts)`,
    )
      .bind(cliente.userId)
      .first<{ n: number }>();

    expect(sueltas!.n).toBe(0);
  });
});

describe("exportar e importar una transferencia", () => {
  it("sobrevive al viaje de ida y vuelta con sus dos patas y sus saldos", async () => {
    await crearTransferencia(efectivo.id, banco.id, 150);
    await cliente.post("/api/transactions", {
      amount: 40,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId: comida.id,
      date: Date.now(),
    });

    const antesEfectivo = await saldoDe(efectivo.id);
    const antesBanco = await saldoDe(banco.id);

    const respaldo = await cliente.get("/api/data/json");
    const contenido = await respaldo.text();
    esperarEstado(
      await cliente.postRaw("/api/data/json", contenido, "application/json"),
      200,
    );

    const despues = await transacciones();
    const patas = despues.filter((t) => t.type === "TRANSFER");

    // Siguen siendo dos, con un grupo compartido y cuentas cruzadas.
    expect(patas).toHaveLength(2);
    expect(new Set(patas.map((t) => t.transferGroupId)).size).toBe(1);
    expect(patas.every((t) => t.transferGroupId !== null)).toBe(true);

    const saliente = patas.find((t) => t.isOutgoing)!;
    const entrante = patas.find((t) => !t.isOutgoing)!;
    expect(saliente.accountId).toBe(entrante.transferAccountId);
    expect(saliente.transferAccountId).toBe(entrante.accountId);

    // Y los saldos son los mismos que antes de exportar.
    const nuevas = await cuentas();
    const nuevoEfectivo = nuevas.find((c) => c.name === efectivo.name)!;
    const nuevoBanco = nuevas.find((c) => c.name === banco.name)!;
    expect(nuevoEfectivo.currentBalance).toBe(antesEfectivo);
    expect(nuevoBanco.currentBalance).toBe(antesBanco);
  });
});

describe("integridad después de una vida entera de ediciones", () => {
  it("crear, editar cinco veces y borrar deja los saldos a cero", async () => {
    await crearTransferencia(efectivo.id, banco.id, 100);

    /**
     * Se relee siempre la pata SALIENTE, no por id: al cambiar de cuentas el
     * servidor rehace la pareja, así que quedarse con un id concreto haría el
     * test frágil por un motivo que no es el que se está auditando.
     */
    const salienteActual = async () =>
      (await transacciones()).find((t) => t.type === "TRANSFER" && t.isOutgoing)!;

    let actual = await salienteActual();

    for (const [importe, destino] of [
      [150, banco.id],
      [150, tarjeta.id],
      [75, tarjeta.id],
      [75, banco.id],
      [300, banco.id],
    ] as const) {
      esperarEstado(
        await editar(actual, { amount: importe, transferAccountId: destino }),
        200,
      );
      actual = await salienteActual();

      // Invariante en cada paso: exactamente dos patas y patrimonio intacto.
      const patas = (await transacciones()).filter((t) => t.type === "TRANSFER");
      expect(patas).toHaveLength(2);
      const total = (await cuentas()).reduce((s, c) => s + c.currentBalance, 0);
      expect(total).toBe(0);
    }

    esperarEstado(await cliente.del(`/api/transactions/${actual.id}`), 200);

    expect(await transacciones()).toHaveLength(0);
    for (const cuenta of await cuentas()) expect(cuenta.currentBalance).toBe(0);
  });
});
