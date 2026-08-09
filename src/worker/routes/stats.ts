import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { Hono } from "hono";

import {
  addMonths,
  dayKey,
  monthLabel,
  monthRange,
  shortMonthLabel,
  yearMonth,
} from "@/lib/dates.ts";
import type {
  CategorySpend,
  DailySpend,
  DashboardSummary,
  MonthlyTrendPoint,
} from "@/shared/types.ts";

import type { AppEnv } from "../context.ts";
import { accountCurrentBalance } from "../db/queries.ts";
import { transactions, walletAccounts } from "../db/schema.ts";

/**
 * Agregados para el dashboard, las estadísticas y el calendario.
 *
 * **Todo rango de fechas se calcula en la zona horaria del usuario**, nunca en
 * UTC. Es la corrección de §8.6: la app Android agrupaba el mapa de calor por
 * día UTC y luego releía ese valor en hora local, encadenando dos
 * desplazamientos. En UTC−4 eso movía al día anterior todo gasto anterior a las
 * 20:00 locales.
 */
const app = new Hono<AppEnv>();

/** Lee `year`/`month` de la query, o usa el mes actual del usuario. */
function requestedMonth(
  c: { req: { query: (k: string) => string | undefined } },
  timeZone: string,
) {
  const y = Number(c.req.query("year"));
  const m = Number(c.req.query("month"));
  if (Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12) {
    return { year: y, month: m };
  }
  return yearMonth(Date.now(), timeZone);
}

/** Resumen del dashboard: balance total y flujo del mes. */
app.get("/dashboard", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const timeZone = c.get("timeZone");
  const { year, month } = requestedMonth(c, timeZone);
  const { from, to } = monthRange(year, month, timeZone);

  const [balance] = await db
    .select({
      // Solo las cuentas marcadas para el total (§8.1). Las excluidas siguen
      // apareciendo en la lista de cuentas con su propio saldo.
      total: sql<number>`COALESCE(SUM(CASE WHEN ${walletAccounts.includeInTotal} = 1
                                           THEN ${accountCurrentBalance()} ELSE 0 END), 0)`,
    })
    .from(walletAccounts)
    .where(and(eq(walletAccounts.userId, userId), isNull(walletAccounts.deletedAt)));

  const [flow] = await db
    .select({
      // Las transferencias no cuentan como ingreso ni como gasto: mover dinero
      // entre cuentas propias no cambia el patrimonio.
      income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'INCOME'
                                            THEN ${transactions.amount} ELSE 0 END), 0)`,
      expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'EXPENSE'
                                             THEN ${transactions.amount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
        gte(transactions.date, from),
        lte(transactions.date, to),
      ),
    );

  const summary: DashboardSummary = {
    totalBalance: balance?.total ?? 0,
    monthIncome: flow?.income ?? 0,
    monthExpense: flow?.expense ?? 0,
    year,
    month,
    monthLabel: monthLabel(year, month),
  };

  return c.json(summary);
});

/** Gasto por categoría del mes elegido, para el gráfico de tarta. */
app.get("/by-category", async (c) => {
  const db = c.get("db");
  const timeZone = c.get("timeZone");
  const { year, month } = requestedMonth(c, timeZone);
  const { from, to } = monthRange(year, month, timeZone);

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      total: sql<number>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, c.get("userId")),
        eq(transactions.type, "EXPENSE"),
        isNull(transactions.deletedAt),
        gte(transactions.date, from),
        lte(transactions.date, to),
      ),
    )
    .groupBy(transactions.categoryId)
    .orderBy(sql`SUM(${transactions.amount}) DESC`);

  return c.json(rows as CategorySpend[]);
});

/**
 * Tendencia de gasto de los últimos 6 meses: el actual y los 5 anteriores,
 * como en `StatisticsViewModel.launch6MonthTrend`.
 */
app.get("/trend", async (c) => {
  const db = c.get("db");
  const timeZone = c.get("timeZone");
  const { year, month } = requestedMonth(c, timeZone);

  const months = Array.from({ length: 6 }, (_, i) => addMonths(year, month, -(5 - i)));
  const desde = monthRange(months[0]!.year, months[0]!.month, timeZone).from;
  const hasta = monthRange(year, month, timeZone).to;

  // Una sola consulta para los 6 meses; el reparto se hace en JS porque agrupar
  // por mes local no se puede expresar en SQLite sin zona horaria.
  const rows = await db
    .select({ date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, c.get("userId")),
        eq(transactions.type, "EXPENSE"),
        isNull(transactions.deletedAt),
        gte(transactions.date, desde),
        lte(transactions.date, hasta),
      ),
    );

  const totals = new Map<string, number>();
  for (const row of rows) {
    const { year: y, month: m } = yearMonth(row.date, timeZone);
    const key = `${y}-${m}`;
    totals.set(key, (totals.get(key) ?? 0) + row.amount);
  }

  const trend: MonthlyTrendPoint[] = months.map((ym) => ({
    year: ym.year,
    month: ym.month,
    label: shortMonthLabel(ym.year, ym.month),
    total: totals.get(`${ym.year}-${ym.month}`) ?? 0,
  }));

  return c.json(trend);
});

/**
 * Gasto por día del mes, para el mapa de calor del calendario.
 *
 * Aquí está la corrección de §8.6. La agrupación se hace en JS con `dayKey`, que
 * usa la zona del usuario; SQLite no sabe de zonas horarias, así que hacerlo en
 * SQL obligaría a agrupar por día UTC — el bug original. El volumen es de un mes
 * de transacciones personales, así que traerlas y agrupar en memoria no es
 * problema.
 */
app.get("/daily", async (c) => {
  const db = c.get("db");
  const timeZone = c.get("timeZone");
  const { year, month } = requestedMonth(c, timeZone);
  const { from, to } = monthRange(year, month, timeZone);

  const rows = await db
    .select({ date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, c.get("userId")),
        eq(transactions.type, "EXPENSE"),
        isNull(transactions.deletedAt),
        gte(transactions.date, from),
        lte(transactions.date, to),
      ),
    );

  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(row.date, timeZone);
    totals.set(key, (totals.get(key) ?? 0) + row.amount);
  }

  const daily: DailySpend[] = [...totals.entries()]
    .map(([day, total]) => ({ day, total }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return c.json(daily);
});

export default app;
