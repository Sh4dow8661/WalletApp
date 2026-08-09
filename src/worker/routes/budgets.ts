import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";

import { budgetMetrics, currentPeriod, isBudgetActive } from "@/lib/budget-period.ts";
import { uuidv7 } from "@/lib/id.ts";
import { BUDGET_RECURRENCES } from "@/shared/constants.ts";
import type { Budget } from "@/shared/types.ts";

import type { AppEnv } from "../context.ts";
import type { Db } from "../db/client.ts";
import { budgets, transactionBudgetRef, transactions } from "../db/schema.ts";
import { Validator } from "../validation.ts";

/**
 * CRUD de presupuestos, con el gasto y los derivados ya calculados.
 *
 * El gasto del período es `Σ(EXPENSE enlazados) − Σ(INCOME enlazados)` con fecha
 * dentro del período actual: los ingresos enlazados actúan como reembolso y
 * devuelven saldo (§8.4). No hay matching automático por categoría ni cuenta —
 * eso se eliminó en la migración 4→5 de Room.
 */
const app = new Hono<AppEnv>();

/**
 * Enriquece los presupuestos con período, gasto y derivados.
 *
 * El período de cada presupuesto se calcula en JS (`currentPeriod`) porque la
 * regla de anclaje mensual con recorte de día no se expresa razonablemente en
 * SQL. Después se traen **todos** los enlaces de una sola vez y se agregan en
 * memoria: son datos personales, no hay volumen que justifique N consultas.
 */
async function enrich(
  db: Db,
  rows: (typeof budgets.$inferSelect)[],
  timeZone: string,
  now: number,
): Promise<Budget[]> {
  if (rows.length === 0) return [];

  const periods = new Map(
    rows.map((b) => [
      b.id,
      currentPeriod(
        b.startDate,
        b.endDate,
        b.recurrence as Budget["recurrence"],
        now,
        timeZone,
      ),
    ]),
  );

  const links = await db
    .select({
      budgetId: transactionBudgetRef.budgetId,
      type: transactions.type,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactionBudgetRef)
    .innerJoin(transactions, eq(transactions.id, transactionBudgetRef.transactionId))
    .where(
      and(
        inArray(
          transactionBudgetRef.budgetId,
          rows.map((b) => b.id),
        ),
        isNull(transactions.deletedAt),
      ),
    );

  const spentByBudget = new Map<string, number>();
  for (const link of links) {
    const period = periods.get(link.budgetId);
    if (!period || link.date < period.start || link.date > period.end) continue;
    // Los gastos suman; los ingresos restan (reembolso). Las transferencias no
    // llegan aquí porque nunca se enlazan, pero el ELSE 0 lo deja explícito.
    const delta =
      link.type === "EXPENSE" ? link.amount : link.type === "INCOME" ? -link.amount : 0;
    spentByBudget.set(link.budgetId, (spentByBudget.get(link.budgetId) ?? 0) + delta);
  }

  return rows.map((b) => {
    const recurrence = b.recurrence as Budget["recurrence"];
    const period = periods.get(b.id)!;
    const spent = spentByBudget.get(b.id) ?? 0;
    const metrics = budgetMetrics(b.amount, spent, period, now, timeZone);

    return {
      id: b.id,
      name: b.name,
      amount: b.amount,
      startDate: b.startDate,
      endDate: b.endDate,
      recurrence,
      spent,
      periodStart: period.start,
      periodEnd: period.end,
      ...metrics,
      isActive: isBudgetActive(b.startDate, b.endDate, recurrence, now),
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  });
}

app.get("/", async (c) => {
  const db = c.get("db");
  const rows = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.userId, c.get("userId")), isNull(budgets.deletedAt)))
    .orderBy(asc(budgets.createdAt));

  return c.json(await enrich(db, rows, c.get("timeZone"), Date.now()));
});

app.get("/:id", async (c) => {
  const db = c.get("db");
  const rows = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.id, c.req.param("id")),
        eq(budgets.userId, c.get("userId")),
        isNull(budgets.deletedAt),
      ),
    );

  if (rows.length === 0) return c.json({ error: "Presupuesto no encontrado" }, 404);
  const [budget] = await enrich(db, rows, c.get("timeZone"), Date.now());
  return c.json(budget);
});

/** Valida el cuerpo de alta/edición de un presupuesto. */
function parseBudget(body: Record<string, unknown>) {
  const v = new Validator(body);
  const id = v.optionalId("id");
  const name = v.requiredString("name", 100);
  const amount = v.positiveAmount("amount");
  const startDate = v.timestamp("startDate");
  const endDate = v.timestamp("endDate");
  const recurrence = v.enum("recurrence", BUDGET_RECURRENCES);

  // En los recurrentes `endDate` solo marca el fin del primer período, pero
  // invertido no tiene sentido en ningún caso.
  if (endDate < startDate)
    v.reject("endDate", "La fecha final no puede ser anterior al inicio");

  v.throwIfInvalid();
  return { id, name, amount, startDate, endDate, recurrence };
}

app.post("/", async (c) => {
  const parsed = parseBudget(await c.req.json());
  const id = parsed.id ?? uuidv7();
  const now = Date.now();

  await c
    .get("db")
    .insert(budgets)
    .values({
      id,
      userId: c.get("userId"),
      name: parsed.name,
      amount: parsed.amount,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      recurrence: parsed.recurrence,
      createdAt: now,
      updatedAt: now,
    });

  return c.json({ id }, 201);
});

app.put("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");
  const parsed = parseBudget(await c.req.json());

  const [existing] = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(
      and(eq(budgets.id, id), eq(budgets.userId, userId), isNull(budgets.deletedAt)),
    );

  if (!existing) return c.json({ error: "Presupuesto no encontrado" }, 404);

  await db
    .update(budgets)
    .set({
      name: parsed.name,
      amount: parsed.amount,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      recurrence: parsed.recurrence,
      updatedAt: Date.now(),
    })
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)));

  return c.json({ id });
});

/**
 * Borrado lógico del presupuesto y de sus enlaces.
 *
 * Los enlaces sí se borran físicamente: son una tabla de unión sin valor
 * histórico, y dejarlos vivos haría que un presupuesto restaurado recuperase
 * enlaces a transacciones que quizá ya no existen.
 */
app.delete("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");
  const now = Date.now();

  const [existing] = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(
      and(eq(budgets.id, id), eq(budgets.userId, userId), isNull(budgets.deletedAt)),
    );

  if (!existing) return c.json({ error: "Presupuesto no encontrado" }, 404);

  await db.batch([
    db.delete(transactionBudgetRef).where(eq(transactionBudgetRef.budgetId, id)),
    db
      .update(budgets)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId))),
  ]);

  return c.json({ id });
});

export default app;
