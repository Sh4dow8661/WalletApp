import { beforeEach, describe, expect, it } from "vitest";

import { dateInputToMillis, millisToDateInput } from "../../src/lib/dates.ts";
import type {
  Account,
  Category,
  FixedExpense,
  Transaction,
} from "../../src/shared/types.ts";

import { type Cliente, crearUsuario, esperarEstado } from "./helpers.ts";

/** Gastos fijos: periodicidad, avance de vencimiento y pago manual. */

const TZ = "America/Puerto_Rico";
const dia = (iso: string) => dateInputToMillis(iso, TZ);
const comoIso = (millis: number) => millisToDateInput(millis, TZ);

let cliente: Cliente;
let efectivo: Account;
let comida: Category;

const gastosFijos = async () =>
  cliente.json<FixedExpense[]>(await cliente.get("/api/fixed-expenses"));
const movimientos = async () =>
  cliente.json<Transaction[]>(await cliente.get("/api/transactions"));

async function crear(extra: Record<string, unknown> = {}) {
  const respuesta = await cliente.post("/api/fixed-expenses", {
    name: "Seguro",
    amount: 600,
    everyMonths: 12,
    nextDueDate: dia("2026-03-15"),
    accountId: efectivo.id,
    categoryId: comida.id,
    ...extra,
  });
  return respuesta;
}

beforeEach(async () => {
  cliente = await crearUsuario();
  const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));
  efectivo = cuentas[0]!;
  const cats = await cliente.json<Category[]>(await cliente.get("/api/categories"));
  comida = cats.find((c) => c.name === "Comida" && c.type === "EXPENSE")!;
});

describe("alta y validación", () => {
  it("crea un gasto fijo y ancla el día del vencimiento", async () => {
    esperarEstado(await crear({ nextDueDate: dia("2026-01-31") }), 201);

    const [gasto] = await gastosFijos();
    expect(gasto!.anchorDay).toBe(31);
    expect(gasto!.everyMonths).toBe(12);
    expect(gasto!.isActive).toBe(true);
  });

  it("rechaza un importe de cero o negativo", async () => {
    esperarEstado(await crear({ amount: 0 }), 400);
    esperarEstado(await crear({ amount: -10 }), 400);
  });

  it("rechaza una periodicidad menor que un mes o disparatada", async () => {
    esperarEstado(await crear({ everyMonths: 0 }), 400);
    esperarEstado(await crear({ everyMonths: 121 }), 400);
  });

  it("rechaza una periodicidad con decimales", async () => {
    esperarEstado(await crear({ everyMonths: 1.5 }), 400);
  });

  it("admite periodicidad libre, no solo 1/3/6/12", async () => {
    esperarEstado(await crear({ everyMonths: 4 }), 201);
    expect((await gastosFijos())[0]!.everyMonths).toBe(4);
  });
});

describe("marcar como pagado", () => {
  it("crea la transacción real y avanza el vencimiento", async () => {
    await crear({ everyMonths: 1, nextDueDate: dia("2026-03-15") });
    const [gasto] = await gastosFijos();

    const respuesta = await cliente.post(`/api/fixed-expenses/${gasto!.id}/pagar`, {
      paidAt: dia("2026-03-15"),
    });
    esperarEstado(respuesta, 200);

    // La transacción existe, con el importe y la cuenta del gasto fijo.
    const pagos = (await movimientos()).filter((t) => t.note === "Seguro");
    expect(pagos).toHaveLength(1);
    expect(pagos[0]!.type).toBe("EXPENSE");
    expect(pagos[0]!.amount).toBe(600);
    expect(pagos[0]!.accountId).toBe(efectivo.id);

    // Y el vencimiento ya apunta al mes siguiente.
    expect(comoIso((await gastosFijos())[0]!.nextDueDate)).toBe("2026-04-15");
  });

  it("el gasto pagado descuenta del saldo de la cuenta", async () => {
    await crear({ amount: 100, everyMonths: 1 });
    const [gasto] = await gastosFijos();
    await cliente.post(`/api/fixed-expenses/${gasto!.id}/pagar`, {});

    const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));
    expect(cuentas.find((c) => c.id === efectivo.id)!.currentBalance).toBe(-100);
  });

  it("un recibo del 31 pasa por febrero y VUELVE al 31", async () => {
    // El caso que se rompe si el día se derivase del último vencimiento en vez
    // de guardar el ancla.
    await crear({ everyMonths: 1, nextDueDate: dia("2026-01-31") });
    const [gasto] = await gastosFijos();

    const serie: string[] = [];
    for (let i = 0; i < 3; i++) {
      await cliente.post(`/api/fixed-expenses/${gasto!.id}/pagar`, {});
      serie.push(comoIso((await gastosFijos())[0]!.nextDueDate));
    }

    expect(serie).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("no deja pagar si no hay cuenta de la que salga", async () => {
    await crear({ accountId: null });
    const [gasto] = await gastosFijos();

    esperarEstado(await cliente.post(`/api/fixed-expenses/${gasto!.id}/pagar`, {}), 400);
    // Y no se ha creado ninguna transacción suelta.
    expect((await movimientos()).filter((t) => t.note === "Seguro")).toHaveLength(0);
  });

  it("pagar un gasto que no existe da 404", async () => {
    esperarEstado(
      await cliente.post(
        "/api/fixed-expenses/01900000-0000-7000-8000-000000000000/pagar",
        {},
      ),
      404,
    );
  });
});

describe("edición y borrado", () => {
  it("cambiar la fecha a mano reancla el día", async () => {
    await crear({ nextDueDate: dia("2026-01-31") });
    const [gasto] = await gastosFijos();

    esperarEstado(
      await cliente.put(`/api/fixed-expenses/${gasto!.id}`, {
        name: gasto!.name,
        amount: gasto!.amount,
        everyMonths: gasto!.everyMonths,
        nextDueDate: dia("2026-06-15"),
        accountId: gasto!.accountId,
        categoryId: gasto!.categoryId,
      }),
      200,
    );

    // Si el usuario mueve la fecha al 15, a partir de ahora vence el 15.
    expect((await gastosFijos())[0]!.anchorDay).toBe(15);
  });

  it("el borrado es lógico y NO borra los pagos ya registrados", async () => {
    await crear({ amount: 100, everyMonths: 1 });
    const [gasto] = await gastosFijos();
    await cliente.post(`/api/fixed-expenses/${gasto!.id}/pagar`, {});

    esperarEstado(await cliente.del(`/api/fixed-expenses/${gasto!.id}`), 200);

    expect(await gastosFijos()).toHaveLength(0);
    // El gasto ocurrió de verdad: borrarlo descuadraría el balance.
    expect((await movimientos()).filter((t) => t.note === "Seguro")).toHaveLength(1);
  });

  it("borrar dos veces da 404 la segunda", async () => {
    await crear();
    const [gasto] = await gastosFijos();
    esperarEstado(await cliente.del(`/api/fixed-expenses/${gasto!.id}`), 200);
    esperarEstado(await cliente.del(`/api/fixed-expenses/${gasto!.id}`), 404);
  });
});
