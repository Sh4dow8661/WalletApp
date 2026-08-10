import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { Hono } from "hono";

import { budgetMetrics, currentPeriod, isBudgetActive } from "@/lib/budget-period.ts";
import { type MovimientoImputable, budgetSpend } from "@/lib/budget-spend.ts";
import { uuidv7 } from "@/lib/id.ts";
import { BUDGET_RECURRENCES } from "@/shared/constants.ts";
import type { Budget } from "@/shared/types.ts";

import type { AppEnv } from "../context.ts";
import { type Statement, runBatch } from "../db/batch.ts";
import type { Db } from "../db/client.ts";
import {
  budgetCategories,
  budgets,
  categories,
  transactionBudgetRef,
  transactions,
} from "../db/schema.ts";
import { Validator } from "../validation.ts";

/**
 * CRUD de presupuestos, con el gasto y los derivados ya calculados.
 *
 * Un movimiento cuenta si es de una de las **categorías** del presupuesto o si
 * está **enlazado a mano**; lo que suma es la unión de las dos vías, sin contar
 * dos veces. El signo lo pone `lib/budget-spend.ts`: el gasto suma, el ingreso
 * resta y la transferencia no cuenta nunca (§8.4 y §20).
 *
 * El matching por categoría es el que la app Android perdió en MIGRATION_4_5.
 * Vuelve, pero conviviendo con el enlace manual en vez de sustituirlo.
 */
const app = new Hono<AppEnv>();

/** Lo que se acumula de cada presupuesto antes de calcular su gasto. */
interface Acumulado {
  movimientos: MovimientoImputable[];
  categoryIds: Set<string>;
  staleCategoryIds: Set<string>;
  enlazados: Set<string>;
}

/**
 * Enriquece los presupuestos con período, categorías, gasto y derivados.
 *
 * El período de cada presupuesto se calcula en JS (`currentPeriod`) porque la
 * regla de anclaje mensual con recorte de día no se expresa razonablemente en
 * SQL. Después se traen los movimientos de una sola vez y se agregan en
 * memoria: son datos personales, no hay volumen que justifique N consultas.
 *
 * Nada se filtra por la lista de presupuestos: D1 solo admite 100 variables por
 * sentencia y una lista de identificadores se las come a razón de una por
 * elemento. Se filtra por `userId` y, además, **por el rango de fechas que
 * abarcan todos los períodos vigentes**, que es lo que evita arrastrar años de
 * historial para calcular el mes en curso.
 */
async function enrich(
  db: Db,
  userId: string,
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

  const desde = Math.min(...[...periods.values()].map((p) => p.start));
  const hasta = Math.max(...[...periods.values()].map((p) => p.end));
  const enRango = and(
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
    gte(transactions.date, desde),
    lte(transactions.date, hasta),
  );

  const [vinculosCategoria, porCategoria, enlacesManuales] = await Promise.all([
    // Qué categorías alimentan cada presupuesto, y si alguna está borrada. Se
    // filtra por `categories.userId`, que es lo que ata la relación al usuario.
    db
      .select({
        budgetId: budgetCategories.budgetId,
        categoryId: budgetCategories.categoryId,
        deletedAt: categories.deletedAt,
      })
      .from(budgetCategories)
      .innerJoin(categories, eq(categories.id, budgetCategories.categoryId))
      .where(eq(categories.userId, userId)),

    // Movimientos que casan por categoría. El JOIN los reparte ya por
    // presupuesto, así que no hace falta una consulta por cada uno.
    db
      .select({
        budgetId: budgetCategories.budgetId,
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        date: transactions.date,
        categoryId: transactions.categoryId,
      })
      .from(budgetCategories)
      .innerJoin(transactions, eq(transactions.categoryId, budgetCategories.categoryId))
      .where(enRango),

    db
      .select({
        budgetId: transactionBudgetRef.budgetId,
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        date: transactions.date,
        categoryId: transactions.categoryId,
      })
      .from(transactionBudgetRef)
      .innerJoin(transactions, eq(transactions.id, transactionBudgetRef.transactionId))
      .where(enRango),
  ]);

  const porPresupuesto = new Map<string, Acumulado>();
  const acumuladoDe = (budgetId: string): Acumulado | undefined => {
    // Solo se acumula lo de los presupuestos que se están devolviendo: una fila
    // que apunte a otro presupuesto no tiene período y no pinta nada aquí.
    if (!periods.has(budgetId)) return undefined;
    let acumulado = porPresupuesto.get(budgetId);
    if (!acumulado) {
      acumulado = {
        movimientos: [],
        categoryIds: new Set(),
        staleCategoryIds: new Set(),
        enlazados: new Set(),
      };
      porPresupuesto.set(budgetId, acumulado);
    }
    return acumulado;
  };

  for (const vinculo of vinculosCategoria) {
    const acumulado = acumuladoDe(vinculo.budgetId);
    if (!acumulado) continue;
    acumulado.categoryIds.add(vinculo.categoryId);
    if (vinculo.deletedAt !== null) acumulado.staleCategoryIds.add(vinculo.categoryId);
  }

  for (const fila of porCategoria) {
    acumuladoDe(fila.budgetId)?.movimientos.push(fila);
  }

  for (const fila of enlacesManuales) {
    const acumulado = acumuladoDe(fila.budgetId);
    if (!acumulado) continue;
    acumulado.movimientos.push(fila);
    acumulado.enlazados.add(fila.id);
  }

  return rows.map((b) => {
    const recurrence = b.recurrence as Budget["recurrence"];
    const period = periods.get(b.id)!;
    const acumulado = porPresupuesto.get(b.id);

    const desglose = budgetSpend(
      acumulado?.movimientos ?? [],
      period,
      acumulado?.categoryIds ?? new Set(),
      acumulado?.enlazados ?? new Set(),
    );
    const metrics = budgetMetrics(b.amount, desglose.spent, period, now, timeZone);

    return {
      id: b.id,
      name: b.name,
      amount: b.amount,
      startDate: b.startDate,
      endDate: b.endDate,
      recurrence,
      categoryIds: [...(acumulado?.categoryIds ?? [])],
      staleCategoryIds: [...(acumulado?.staleCategoryIds ?? [])],
      spent: desglose.spent,
      spentFromCategories: desglose.spentFromCategories,
      spentFromManual: desglose.spentFromManual,
      periodStart: period.start,
      periodEnd: period.end,
      ...metrics,
      isActive: isBudgetActive(b.startDate, b.endDate, recurrence, now),
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  });
}

/**
 * Comprueba que las categorías son del usuario y no están borradas.
 *
 * Los identificadores llegan del cliente, así que no basta con que existan:
 * podrían ser de otro usuario. Se resuelven contra la base filtrando por
 * `userId`, igual que hace el resto del API.
 */
async function validarCategorias(
  db: Db,
  userId: string,
  categoryIds: readonly string[],
): Promise<string | null> {
  if (categoryIds.length === 0) return null;

  const encontradas = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        isNull(categories.deletedAt),
        inArray(categories.id, [...categoryIds]),
      ),
    );

  return encontradas.length === categoryIds.length
    ? null
    : "Alguna categoría no existe o no es tuya";
}

/** Sentencias que dejan las categorías del presupuesto exactamente en `ids`. */
function sentenciasDeCategorias(
  db: Db,
  budgetId: string,
  ids: readonly string[],
): Statement[] {
  // Se borra y se vuelve a insertar en vez de calcular el diferencial: son dos
  // o tres filas, y así el estado final no depende de lo que hubiera antes.
  const sentencias: Statement[] = [
    db.delete(budgetCategories).where(eq(budgetCategories.budgetId, budgetId)),
  ];
  if (ids.length > 0) {
    sentencias.push(
      db
        .insert(budgetCategories)
        .values(ids.map((categoryId) => ({ budgetId, categoryId })))
        .onConflictDoNothing(),
    );
  }
  return sentencias;
}

app.get("/", async (c) => {
  const db = c.get("db");
  const rows = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.userId, c.get("userId")), isNull(budgets.deletedAt)))
    .orderBy(asc(budgets.createdAt));

  return c.json(await enrich(db, c.get("userId"), rows, c.get("timeZone"), Date.now()));
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
  const [budget] = await enrich(db, c.get("userId"), rows, c.get("timeZone"), Date.now());
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

  // Ausente y lista vacía NO son lo mismo: ausente deja las categorías como
  // estén —para que un cliente viejo que no conoce el campo no las borre sin
  // querer al editar— y la lista vacía las quita todas.
  const categoryIds = v.has("categoryIds") ? v.idArray("categoryIds") : undefined;

  // En los recurrentes `endDate` solo marca el fin del primer período, pero
  // invertido no tiene sentido en ningún caso.
  if (endDate < startDate)
    v.reject("endDate", "La fecha final no puede ser anterior al inicio");

  v.throwIfInvalid();
  return { id, name, amount, startDate, endDate, recurrence, categoryIds };
}

app.post("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const parsed = parseBudget(await c.req.json());
  const id = parsed.id ?? uuidv7();
  const now = Date.now();

  const categoryIds = parsed.categoryIds ?? [];
  const error = await validarCategorias(db, userId, categoryIds);
  if (error)
    return c.json({ error: "Datos inválidos", fields: { categoryIds: error } }, 400);

  await runBatch(db, [
    db.insert(budgets).values({
      id,
      userId,
      name: parsed.name,
      amount: parsed.amount,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      recurrence: parsed.recurrence,
      createdAt: now,
      updatedAt: now,
    }),
    ...sentenciasDeCategorias(db, id, categoryIds),
  ]);

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

  if (parsed.categoryIds !== undefined) {
    const error = await validarCategorias(db, userId, parsed.categoryIds);
    if (error) {
      return c.json({ error: "Datos inválidos", fields: { categoryIds: error } }, 400);
    }
  }

  await runBatch(db, [
    db
      .update(budgets)
      .set({
        name: parsed.name,
        amount: parsed.amount,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        recurrence: parsed.recurrence,
        updatedAt: Date.now(),
      })
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId))),
    // Ausente = no se tocan. Ver `parseBudget`.
    ...(parsed.categoryIds === undefined
      ? []
      : sentenciasDeCategorias(db, id, parsed.categoryIds)),
  ]);

  return c.json({ id });
});

/**
 * Borrado lógico del presupuesto, y físico de sus dos tablas de unión.
 *
 * Las uniones sí se borran de verdad: no tienen valor histórico, y dejarlas
 * vivas haría que un presupuesto restaurado recuperase enlaces a transacciones
 * o categorías que quizá ya no existen.
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
    db.delete(budgetCategories).where(eq(budgetCategories.budgetId, id)),
    db
      .update(budgets)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId))),
  ]);

  return c.json({ id });
});

export default app;
