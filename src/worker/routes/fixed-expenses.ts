import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";

import { anchorDayFrom, nextDueDate } from "@/lib/gastos-fijos.ts";
import { uuidv7 } from "@/lib/id.ts";
import type { FixedExpense } from "@/shared/types.ts";

import type { AppEnv } from "../context.ts";
import { fixedExpenses, transactions } from "../db/schema.ts";
import { Validator } from "../validation.ts";

/**
 * Gastos fijos recurrentes.
 *
 * El costo mensual equivalente NO se guarda: es un derivado de `amount` y
 * `everyMonths`, y lo calcula `lib/gastos-fijos.ts` en los dos lados. Guardarlo
 * sería tener la misma verdad en dos sitios que pueden discrepar.
 */
const app = new Hono<AppEnv>();

/** Techo de periodicidad, igual que el CHECK de la migración 0004. */
const MAX_MESES = 120;

const selection = {
  id: fixedExpenses.id,
  name: fixedExpenses.name,
  amount: fixedExpenses.amount,
  everyMonths: fixedExpenses.everyMonths,
  nextDueDate: fixedExpenses.nextDueDate,
  anchorDay: fixedExpenses.anchorDay,
  accountId: fixedExpenses.accountId,
  categoryId: fixedExpenses.categoryId,
  isActive: fixedExpenses.isActive,
  note: fixedExpenses.note,
  createdAt: fixedExpenses.createdAt,
  updatedAt: fixedExpenses.updatedAt,
};

app.get("/", async (c) => {
  const rows = await c
    .get("db")
    .select(selection)
    .from(fixedExpenses)
    .where(
      and(eq(fixedExpenses.userId, c.get("userId")), isNull(fixedExpenses.deletedAt)),
    )
    .orderBy(asc(fixedExpenses.nextDueDate));

  return c.json(rows as FixedExpense[]);
});

/** Campos comunes de alta y edición. */
function parseBody(v: Validator) {
  const name = v.requiredString("name", 100);
  const amount = v.positiveAmount("amount");
  const everyMonths = v.number("everyMonths", { min: 1, max: MAX_MESES });
  const nextDue = v.timestamp("nextDueDate");
  const accountId = v.nullableRef("accountId");
  const categoryId = v.nullableRef("categoryId");
  const isActive = v.boolean("isActive", true);
  const note = v.optionalString("note", 500);

  if (!Number.isInteger(everyMonths)) {
    v.reject("everyMonths", "Debe ser un número entero de meses");
  }

  return { name, amount, everyMonths, nextDue, accountId, categoryId, isActive, note };
}

app.post("/", async (c) => {
  const v = new Validator(await c.req.json());
  const id = v.optionalId("id") ?? uuidv7();
  const datos = parseBody(v);
  v.throwIfInvalid();

  const now = Date.now();
  await c
    .get("db")
    .insert(fixedExpenses)
    .values({
      id,
      userId: c.get("userId"),
      name: datos.name,
      amount: datos.amount,
      everyMonths: datos.everyMonths,
      nextDueDate: datos.nextDue,
      // El ancla sale de la primera fecha que elige el usuario y ya no cambia.
      anchorDay: anchorDayFrom(datos.nextDue, c.get("timeZone")),
      accountId: datos.accountId,
      categoryId: datos.categoryId,
      isActive: datos.isActive,
      note: datos.note,
      createdAt: now,
      updatedAt: now,
    });

  return c.json({ id }, 201);
});

app.put("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");

  const v = new Validator(await c.req.json());
  const datos = parseBody(v);
  v.throwIfInvalid();

  const [existente] = await db
    .select({ id: fixedExpenses.id })
    .from(fixedExpenses)
    .where(
      and(
        eq(fixedExpenses.id, id),
        eq(fixedExpenses.userId, userId),
        isNull(fixedExpenses.deletedAt),
      ),
    );

  if (!existente) return c.json({ error: "Gasto fijo no encontrado" }, 404);

  await db
    .update(fixedExpenses)
    .set({
      name: datos.name,
      amount: datos.amount,
      everyMonths: datos.everyMonths,
      nextDueDate: datos.nextDue,
      // Al cambiar la fecha a mano se reancla: si el usuario la mueve al 15, su
      // intención es que a partir de ahora venza el 15.
      anchorDay: anchorDayFrom(datos.nextDue, c.get("timeZone")),
      accountId: datos.accountId,
      categoryId: datos.categoryId,
      isActive: datos.isActive,
      note: datos.note,
      updatedAt: Date.now(),
    })
    .where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, userId)));

  return c.json({ id });
});

/**
 * Marcar como pagado.
 *
 * Crea la transacción REAL en la cuenta indicada y avanza el vencimiento al
 * siguiente ciclo, todo en un mismo batch: o pasan las dos cosas o ninguna.
 *
 * Nunca ocurre solo. La app no genera transacciones automáticas por su cuenta:
 * hace falta que el usuario pulse el botón, que es lo que se pidió.
 */
app.post("/:id/pagar", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");

  const v = new Validator(await c.req.json().catch(() => ({})));
  const transactionId = v.optionalId("transactionId") ?? uuidv7();
  // Permite registrar el pago con la fecha real, no siempre "hoy".
  const paidAt = v.has("paidAt") ? v.timestamp("paidAt") : Date.now();
  v.throwIfInvalid();

  const [gasto] = await db
    .select()
    .from(fixedExpenses)
    .where(
      and(
        eq(fixedExpenses.id, id),
        eq(fixedExpenses.userId, userId),
        isNull(fixedExpenses.deletedAt),
      ),
    );

  if (!gasto) return c.json({ error: "Gasto fijo no encontrado" }, 404);
  if (gasto.accountId === null) {
    return c.json(
      { error: "Datos inválidos", fields: { accountId: "Elige de qué cuenta sale" } },
      400,
    );
  }

  const siguiente = nextDueDate(
    gasto.nextDueDate,
    gasto.everyMonths,
    gasto.anchorDay,
    c.get("timeZone"),
  );
  const now = Date.now();

  await db.batch([
    db.insert(transactions).values({
      id: transactionId,
      userId,
      amount: gasto.amount,
      type: "EXPENSE",
      categoryId: gasto.categoryId,
      accountId: gasto.accountId,
      transferAccountId: null,
      transferGroupId: null,
      note: gasto.name,
      date: paidAt,
      isOutgoing: false,
      createdAt: now,
      updatedAt: now,
    }),
    db
      .update(fixedExpenses)
      .set({ nextDueDate: siguiente, updatedAt: now })
      .where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, userId))),
  ]);

  return c.json({ transactionId, nextDueDate: siguiente });
});

/**
 * Borrado lógico.
 *
 * Las transacciones que ya generó NO se tocan: son gastos reales que ocurrieron
 * y borrarlas descuadraría los balances.
 */
app.delete("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");

  const [existente] = await db
    .select({ id: fixedExpenses.id })
    .from(fixedExpenses)
    .where(
      and(
        eq(fixedExpenses.id, id),
        eq(fixedExpenses.userId, userId),
        isNull(fixedExpenses.deletedAt),
      ),
    );

  if (!existente) return c.json({ error: "Gasto fijo no encontrado" }, 404);

  const now = Date.now();
  await db
    .update(fixedExpenses)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, userId)));

  return c.json({ id });
});

export default app;
