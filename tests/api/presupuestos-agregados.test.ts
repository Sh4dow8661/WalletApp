import { beforeEach, describe, expect, it } from "vitest";

import { monthRange, zonedTime } from "../../src/lib/dates.ts";
import type {
  Account,
  Budget,
  Category,
  CategorySpend,
  DailySpend,
  DashboardSummary,
  MonthlyTrendPoint,
} from "../../src/shared/types.ts";

import { type Cliente, crearUsuario, esperarEstado } from "./helpers.ts";

/**
 * Presupuestos (§8.4) y agregados (§8.6).
 *
 * Los agregados son la parte donde la app Android se equivocaba de día: el mapa
 * de calor agrupaba por día UTC y luego releía ese valor en hora local. Estos
 * tests fijan la zona del usuario y comprueban que un gasto de las 10 de la
 * mañana aparece en su día, no en el anterior.
 */

const PR = "America/Puerto_Rico"; // UTC−4

let cliente: Cliente;
let efectivo: Account;
let comida: Category;
let transporte: Category;
let salario: Category;

const presupuestos = async () =>
  cliente.json<Budget[]>(await cliente.get("/api/budgets"));

/** Instante local en Puerto Rico. */
const enPR = (year: number, month: number, day: number, hour = 12) =>
  zonedTime({ year, month, day, hour }, PR);

async function gastar(
  amount: number,
  date: number,
  categoryId: string,
  budgetIds: string[] = [],
) {
  return esperarEstado(
    await cliente.post("/api/transactions", {
      amount,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId,
      date,
      budgetIds,
    }),
    201,
  );
}

beforeEach(async () => {
  cliente = await crearUsuario();
  const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));
  efectivo = cuentas[0]!;
  const cats = await cliente.json<Category[]>(await cliente.get("/api/categories"));
  comida = cats.find((c) => c.name === "Comida" && c.type === "EXPENSE")!;
  transporte = cats.find((c) => c.name === "Transporte")!;
  salario = cats.find((c) => c.name === "Salario")!;
});

describe("gasto de un presupuesto (§8.4)", () => {
  /** Crea un presupuesto que cubre todo 2026. */
  async function crearPresupuesto(amount = 500) {
    const respuesta = await esperarEstado(
      await cliente.post("/api/budgets", {
        name: "Comida del año",
        amount,
        startDate: enPR(2026, 1, 1, 0),
        endDate: enPR(2026, 12, 31, 23),
        recurrence: "NONE",
      }),
      201,
    );
    const { id } = await cliente.json<{ id: string }>(respuesta);
    return id;
  }

  it("solo cuenta las transacciones enlazadas a mano", async () => {
    const id = await crearPresupuesto();

    await gastar(100, enPR(2026, 5, 10), comida.id, [id]); // enlazado
    await gastar(70, enPR(2026, 5, 11), comida.id); // MISMA categoría, sin enlazar

    const [presupuesto] = await presupuestos();
    // No hay matching automático por categoría: eso se eliminó en la migración
    // 4→5 de Room. Solo cuenta lo enlazado explícitamente.
    expect(presupuesto!.spent).toBe(100);
  });

  it("los ingresos enlazados actúan como reembolso y devuelven saldo", async () => {
    const id = await crearPresupuesto();

    await gastar(200, enPR(2026, 5, 10), comida.id, [id]);
    await cliente.post("/api/transactions", {
      amount: 50,
      type: "INCOME",
      accountId: efectivo.id,
      categoryId: salario.id,
      date: enPR(2026, 5, 12),
      budgetIds: [id],
    });

    const [presupuesto] = await presupuestos();
    expect(presupuesto!.spent).toBe(150); // 200 − 50
    expect(presupuesto!.remaining).toBe(350);
  });

  it("una transacción puede enlazarse a varios presupuestos", async () => {
    const a = await crearPresupuesto(500);
    const respuestaB = await cliente.post("/api/budgets", {
      name: "Todo el año",
      amount: 1000,
      startDate: enPR(2026, 1, 1, 0),
      endDate: enPR(2026, 12, 31, 23),
      recurrence: "NONE",
    });
    const { id: b } = await cliente.json<{ id: string }>(respuestaB);

    await gastar(120, enPR(2026, 5, 10), comida.id, [a, b]);

    const lista = await presupuestos();
    expect(lista.find((p) => p.id === a)!.spent).toBe(120);
    expect(lista.find((p) => p.id === b)!.spent).toBe(120);
  });

  it("ignora lo que cae fuera del período", async () => {
    const respuesta = await cliente.post("/api/budgets", {
      name: "Solo mayo",
      amount: 500,
      startDate: enPR(2026, 5, 1, 0),
      endDate: enPR(2026, 5, 31, 23),
      recurrence: "NONE",
    });
    const { id } = await cliente.json<{ id: string }>(respuesta);

    await gastar(100, enPR(2026, 5, 15), comida.id, [id]); // dentro
    await gastar(999, enPR(2026, 6, 15), comida.id, [id]); // fuera, pero enlazado

    const [presupuesto] = await presupuestos();
    expect(presupuesto!.spent).toBe(100);
  });

  it("no deja enlazar presupuestos a una transferencia", async () => {
    const id = await crearPresupuesto();
    const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));

    await cliente.post("/api/transactions", {
      amount: 300,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: cuentas[1]!.id,
      date: enPR(2026, 5, 10),
      budgetIds: [id],
    });

    const [presupuesto] = await presupuestos();
    expect(presupuesto!.spent).toBe(0);
  });

  it("devuelve los derivados que muestra la UI", async () => {
    const id = await crearPresupuesto(1000);
    await gastar(850, enPR(2026, 5, 10), comida.id, [id]);

    const [presupuesto] = await presupuestos();
    expect(presupuesto!.spent).toBe(850);
    expect(presupuesto!.remaining).toBe(150);
    expect(presupuesto!.overspent).toBe(0);
    expect(presupuesto!.progress).toBeCloseTo(0.85, 10);
    expect(presupuesto!.isOverBudget).toBe(false);
    expect(presupuesto!.isNearLimit).toBe(true); // ≥80% sin pasarse
  });

  it("marca el exceso cuando se pasa", async () => {
    const id = await crearPresupuesto(100);
    await gastar(130, enPR(2026, 5, 10), comida.id, [id]);

    const [presupuesto] = await presupuestos();
    expect(presupuesto!.remaining).toBe(0);
    expect(presupuesto!.overspent).toBe(30);
    expect(presupuesto!.isOverBudget).toBe(true);
    expect(presupuesto!.isNearLimit).toBe(false); // pasado no es "cerca"
    expect(presupuesto!.progress).toBe(1); // acotado
  });

  it("borrar el presupuesto no borra las transacciones enlazadas", async () => {
    const id = await crearPresupuesto();
    await gastar(100, enPR(2026, 5, 10), comida.id, [id]);

    await esperarEstado(await cliente.del(`/api/budgets/${id}`), 200);

    expect(await presupuestos()).toHaveLength(0);
    const filas = await cliente.json<unknown[]>(await cliente.get("/api/transactions"));
    expect(filas).toHaveLength(1);
  });

  it("borrar una transacción la descuenta del presupuesto", async () => {
    const id = await crearPresupuesto();
    await gastar(100, enPR(2026, 5, 10), comida.id, [id]);
    await gastar(60, enPR(2026, 5, 11), comida.id, [id]);
    expect((await presupuestos())[0]!.spent).toBe(160);

    const filas = await cliente.json<{ id: string; amount: number }[]>(
      await cliente.get("/api/transactions"),
    );
    const de100 = filas.find((t) => t.amount === 100)!;
    await cliente.del(`/api/transactions/${de100.id}`);

    expect((await presupuestos())[0]!.spent).toBe(60);
  });
});

describe("períodos recurrentes en el API (§8.5)", () => {
  /**
   * El API devuelve siempre el período **vigente ahora**, así que aquí se
   * comprueba que ese período es coherente y que el gasto se reparte según él.
   * La ausencia de huecos con anclas 29/30/31 está cubierta a fondo en
   * `src/lib/budget-period.test.ts`, con un barrido de 730 días.
   */
  async function crearMensualAncladoAFinDeMes() {
    const respuesta = await esperarEstado(
      await cliente.post("/api/budgets", {
        name: "Mensual anclado a fin de mes",
        amount: 1000,
        startDate: enPR(2026, 1, 31, 0),
        endDate: enPR(2026, 2, 28, 23),
        recurrence: "MONTHLY",
      }),
      201,
    );
    return (await cliente.json<{ id: string }>(respuesta)).id;
  }

  it("el período vigente contiene el instante actual", async () => {
    await crearMensualAncladoAFinDeMes();
    const ahora = Date.now();

    const [presupuesto] = await presupuestos();
    expect(presupuesto!.periodStart).toBeLessThanOrEqual(ahora);
    expect(presupuesto!.periodEnd).toBeGreaterThanOrEqual(ahora);
    expect(presupuesto!.isActive).toBe(true);
  });

  it("cuenta el gasto de hoy y no el de períodos pasados", async () => {
    const id = await crearMensualAncladoAFinDeMes();

    await gastar(75, Date.now(), comida.id, [id]);
    // Marzo de 2026 queda en un período anterior: enlazado, pero fuera.
    await gastar(500, enPR(2026, 3, 29), comida.id, [id]);

    const [presupuesto] = await presupuestos();
    expect(presupuesto!.spent).toBe(75);
  });

  it("un presupuesto que aún no ha empezado no está activo", async () => {
    await cliente.post("/api/budgets", {
      name: "Empieza en 2030",
      amount: 500,
      startDate: enPR(2030, 1, 1, 0),
      endDate: enPR(2030, 1, 31, 23),
      recurrence: "MONTHLY",
    });

    const [presupuesto] = await presupuestos();
    expect(presupuesto!.isActive).toBe(false);
    expect(presupuesto!.periodStart).toBe(enPR(2030, 1, 1, 0));
  });
});

describe("agregados y zona horaria (§8.6)", () => {
  it("el mapa de calor pone el gasto en su día LOCAL", async () => {
    // 9 de agosto de 2026 a las 10:00 en Puerto Rico = 14:00 UTC del mismo día.
    // La app Android lo mostraba el día 8.
    await gastar(50, enPR(2026, 8, 9, 10), comida.id);

    const daily = await cliente.json<DailySpend[]>(
      await cliente.get("/api/stats/daily?year=2026&month=8"),
    );

    expect(daily).toEqual([{ day: "2026-08-09", total: 50 }]);
  });

  it("no corre de día ningún gasto a lo largo de las 24 horas", async () => {
    for (const hora of [0, 1, 6, 12, 19, 20, 23]) {
      await gastar(1, enPR(2026, 9, 15, hora), comida.id);
    }

    const daily = await cliente.json<DailySpend[]>(
      await cliente.get("/api/stats/daily?year=2026&month=9"),
    );

    // Los 7 gastos son del mismo día local: si alguno se corriera, saldrían
    // dos entradas.
    expect(daily).toEqual([{ day: "2026-09-15", total: 7 }]);
  });

  it("suma varios gastos del mismo día y ordena por fecha", async () => {
    await gastar(10, enPR(2026, 8, 3), comida.id);
    await gastar(15, enPR(2026, 8, 3), transporte.id);
    await gastar(20, enPR(2026, 8, 1), comida.id);

    const daily = await cliente.json<DailySpend[]>(
      await cliente.get("/api/stats/daily?year=2026&month=8"),
    );

    expect(daily).toEqual([
      { day: "2026-08-01", total: 20 },
      { day: "2026-08-03", total: 25 },
    ]);
  });

  it("el rango del mes no se come el último día", async () => {
    // Un gasto a las 23:00 del 31 tiene que entrar en el mes.
    await gastar(99, enPR(2026, 8, 31, 23), comida.id);

    const daily = await cliente.json<DailySpend[]>(
      await cliente.get("/api/stats/daily?year=2026&month=8"),
    );
    expect(daily).toEqual([{ day: "2026-08-31", total: 99 }]);

    // Y no se cuela en septiembre.
    const septiembre = await cliente.json<DailySpend[]>(
      await cliente.get("/api/stats/daily?year=2026&month=9"),
    );
    expect(septiembre).toEqual([]);
  });

  it("respeta la zona horaria que el usuario elija", async () => {
    // Mismo instante, otra zona: 23:00 del 9 en Puerto Rico son las 12:00 del
    // 10 en Tokio.
    const instante = enPR(2026, 8, 9, 23);
    await gastar(30, instante, comida.id);

    let daily = await cliente.json<DailySpend[]>(
      await cliente.get("/api/stats/daily?year=2026&month=8"),
    );
    expect(daily).toEqual([{ day: "2026-08-09", total: 30 }]);

    await esperarEstado(
      await cliente.put("/api/settings", { timeZone: "Asia/Tokyo" }),
      200,
    );

    daily = await cliente.json<DailySpend[]>(
      await cliente.get("/api/stats/daily?year=2026&month=8"),
    );
    expect(daily).toEqual([{ day: "2026-08-10", total: 30 }]);
  });
});

describe("resumen del dashboard", () => {
  it("separa ingresos y gastos del mes, y excluye las transferencias", async () => {
    const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));

    await gastar(120, enPR(2026, 8, 5), comida.id);
    await cliente.post("/api/transactions", {
      amount: 900,
      type: "INCOME",
      accountId: efectivo.id,
      categoryId: salario.id,
      date: enPR(2026, 8, 1),
    });
    await cliente.post("/api/transactions", {
      amount: 300,
      type: "TRANSFER",
      accountId: efectivo.id,
      transferAccountId: cuentas[1]!.id,
      date: enPR(2026, 8, 10),
    });

    const resumen = await cliente.json<DashboardSummary>(
      await cliente.get("/api/stats/dashboard?year=2026&month=8"),
    );

    // Mover dinero entre cuentas propias no es ni ingreso ni gasto.
    expect(resumen.monthIncome).toBe(900);
    expect(resumen.monthExpense).toBe(120);
    expect(resumen.monthLabel).toBe("Agosto 2026");
  });

  it("no mezcla meses", async () => {
    await gastar(100, enPR(2026, 7, 20), comida.id);
    await gastar(200, enPR(2026, 8, 20), comida.id);

    const julio = await cliente.json<DashboardSummary>(
      await cliente.get("/api/stats/dashboard?year=2026&month=7"),
    );
    const agosto = await cliente.json<DashboardSummary>(
      await cliente.get("/api/stats/dashboard?year=2026&month=8"),
    );

    expect(julio.monthExpense).toBe(100);
    expect(agosto.monthExpense).toBe(200);
  });
});

describe("gasto por categoría", () => {
  it("agrupa y ordena de mayor a menor", async () => {
    await gastar(30, enPR(2026, 8, 5), comida.id);
    await gastar(45, enPR(2026, 8, 6), comida.id);
    await gastar(120, enPR(2026, 8, 7), transporte.id);

    const porCategoria = await cliente.json<CategorySpend[]>(
      await cliente.get("/api/stats/by-category?year=2026&month=8"),
    );

    expect(porCategoria).toEqual([
      { categoryId: transporte.id, total: 120 },
      { categoryId: comida.id, total: 75 },
    ]);
  });

  it("agrupa bajo null lo que quedó sin categoría", async () => {
    await gastar(60, enPR(2026, 8, 5), comida.id);
    await cliente.del(`/api/categories/${comida.id}`);

    const porCategoria = await cliente.json<CategorySpend[]>(
      await cliente.get("/api/stats/by-category?year=2026&month=8"),
    );

    expect(porCategoria).toEqual([{ categoryId: null, total: 60 }]);
  });
});

describe("tendencia de 6 meses", () => {
  it("devuelve el mes pedido y los 5 anteriores, en orden", async () => {
    const tendencia = await cliente.json<MonthlyTrendPoint[]>(
      await cliente.get("/api/stats/trend?year=2026&month=8"),
    );

    expect(tendencia).toHaveLength(6);
    expect(tendencia.map((p) => `${p.year}-${p.month}`)).toEqual([
      "2026-3",
      "2026-4",
      "2026-5",
      "2026-6",
      "2026-7",
      "2026-8",
    ]);
    expect(tendencia.map((p) => p.label)).toEqual([
      "mar",
      "abr",
      "may",
      "jun",
      "jul",
      "ago",
    ]);
  });

  it("reparte el gasto en su mes y deja los vacíos a cero", async () => {
    await gastar(100, enPR(2026, 6, 10), comida.id);
    await gastar(250, enPR(2026, 8, 10), comida.id);

    const tendencia = await cliente.json<MonthlyTrendPoint[]>(
      await cliente.get("/api/stats/trend?year=2026&month=8"),
    );

    expect(tendencia.map((p) => p.total)).toEqual([0, 0, 0, 100, 0, 250]);
  });

  it("cruza el fin de año hacia atrás", async () => {
    const tendencia = await cliente.json<MonthlyTrendPoint[]>(
      await cliente.get("/api/stats/trend?year=2026&month=2"),
    );

    expect(tendencia.map((p) => `${p.year}-${p.month}`)).toEqual([
      "2025-9",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-1",
      "2026-2",
    ]);
  });
});

describe("filtros de la lista de transacciones", () => {
  it("filtra por rango de fechas, categoría y cuenta", async () => {
    await gastar(10, enPR(2026, 8, 5), comida.id);
    await gastar(20, enPR(2026, 8, 15), transporte.id);
    await gastar(30, enPR(2026, 9, 5), comida.id);

    const { from, to } = monthRange(2026, 8, PR);

    const deAgosto = await cliente.json<{ amount: number }[]>(
      await cliente.get(`/api/transactions?from=${from}&to=${to}`),
    );
    expect(deAgosto.map((t) => t.amount).sort((a, b) => a - b)).toEqual([10, 20]);

    const soloComida = await cliente.json<{ amount: number }[]>(
      await cliente.get(`/api/transactions?categoryId=${comida.id}`),
    );
    expect(soloComida.map((t) => t.amount).sort((a, b) => a - b)).toEqual([10, 30]);

    const deLaCuenta = await cliente.json<unknown[]>(
      await cliente.get(`/api/transactions?accountId=${efectivo.id}`),
    );
    expect(deLaCuenta).toHaveLength(3);
  });
});
