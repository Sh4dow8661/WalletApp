import { type SQL, and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { Hono } from "hono";

import { uuidv7 } from "@/lib/id.ts";
import { TRANSACTION_TYPES } from "@/shared/constants.ts";
import type { Transaction } from "@/shared/types.ts";

import type { AppEnv } from "../context.ts";
import { type Statement, runBatch } from "../db/batch.ts";
import type { Db } from "../db/client.ts";
import {
  budgets,
  categories,
  transactionBudgetRef,
  transactions,
  walletAccounts,
} from "../db/schema.ts";
import { ValidationError, Validator } from "../validation.ts";

/**
 * CRUD de transacciones.
 *
 * ## Transferencias
 *
 * Una transferencia son **dos filas**: la saliente (`isOutgoing = true`, con
 * `accountId` = origen) y la entrante (`isOutgoing = false`, con las cuentas
 * cruzadas). Ambas comparten `transferGroupId`.
 *
 * En la app Android no existía ese grupo, y por eso al editar se actualizaba
 * solo la saliente y al borrar solo se iba una pata: los balances se
 * descuadraban en silencio (§8.2). Aquí **crear, editar y borrar operan siempre
 * sobre el grupo entero, dentro de un único batch de D1**, así que no hay
 * ventana en la que una pata esté actualizada y la otra no.
 */
const app = new Hono<AppEnv>();

const selection = {
  id: transactions.id,
  amount: transactions.amount,
  type: transactions.type,
  categoryId: transactions.categoryId,
  accountId: transactions.accountId,
  transferAccountId: transactions.transferAccountId,
  transferGroupId: transactions.transferGroupId,
  note: transactions.note,
  date: transactions.date,
  isOutgoing: transactions.isOutgoing,
  createdAt: transactions.createdAt,
  updatedAt: transactions.updatedAt,
};

/** Añade a cada transacción la lista de presupuestos a los que está enlazada. */
async function withBudgetIds(
  db: Db,
  rows: Omit<Transaction, "budgetIds">[],
): Promise<Transaction[]> {
  if (rows.length === 0) return [];

  const links = await db
    .select({
      transactionId: transactionBudgetRef.transactionId,
      budgetId: transactionBudgetRef.budgetId,
    })
    .from(transactionBudgetRef)
    .where(
      inArray(
        transactionBudgetRef.transactionId,
        rows.map((r) => r.id),
      ),
    );

  const byTransaction = new Map<string, string[]>();
  for (const link of links) {
    const list = byTransaction.get(link.transactionId);
    if (list) list.push(link.budgetId);
    else byTransaction.set(link.transactionId, [link.budgetId]);
  }

  return rows.map((r) => ({ ...r, budgetIds: byTransaction.get(r.id) ?? [] }));
}

app.get("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const { from, to, categoryId, accountId, limit } = c.req.query();

  const filters: SQL[] = [
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
  ];
  if (from) filters.push(gte(transactions.date, Number(from)));
  if (to) filters.push(lte(transactions.date, Number(to)));
  if (categoryId) filters.push(eq(transactions.categoryId, categoryId));
  if (accountId) filters.push(eq(transactions.accountId, accountId));

  const rows = await db
    .select(selection)
    .from(transactions)
    .where(and(...filters))
    // `id` desempata: al ser UUID v7 es cronológico, así que dos transacciones
    // con la misma fecha salen siempre en el mismo orden.
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(Math.min(Number(limit) || 500, 1000));

  return c.json(await withBudgetIds(db, rows));
});

app.get("/:id", async (c) => {
  const db = c.get("db");
  const rows = await db
    .select(selection)
    .from(transactions)
    .where(
      and(
        eq(transactions.id, c.req.param("id")),
        eq(transactions.userId, c.get("userId")),
        isNull(transactions.deletedAt),
      ),
    );

  if (rows.length === 0) return c.json({ error: "Transacción no encontrada" }, 404);
  const [tx] = await withBudgetIds(db, rows);
  return c.json(tx);
});

/** Datos ya validados de una transacción, listos para escribir. */
interface ParsedTransaction {
  id: string;
  amount: number;
  type: (typeof TRANSACTION_TYPES)[number];
  categoryId: string | null;
  accountId: string;
  transferAccountId: string | null;
  note: string;
  date: number;
  budgetIds: string[];
}

/**
 * Valida el cuerpo y comprueba que cuentas, categoría y presupuestos existen
 * **y son del usuario de la sesión**.
 *
 * Sin esta comprobación, un cliente podría enlazar su transacción a la cuenta de
 * otro usuario: los IDs los genera el cliente, así que no basta con que tengan
 * forma válida.
 */
async function parseTransaction(
  db: Db,
  userId: string,
  body: Record<string, unknown>,
): Promise<ParsedTransaction> {
  const v = new Validator(body);
  const id = v.optionalId("id") ?? uuidv7();
  const amount = v.positiveAmount("amount");
  const type = v.enum("type", TRANSACTION_TYPES);
  const accountId = v.requiredRef("accountId");
  const transferAccountId = v.nullableRef("transferAccountId");
  const categoryId = v.nullableRef("categoryId");
  const note = v.optionalString("note", 500);
  const date = v.timestamp("date");
  const budgetIds = v.idArray("budgetIds");

  if (type === "TRANSFER") {
    // Mismas reglas que `AddEditTransactionViewModel.save()`.
    if (!transferAccountId) v.reject("transferAccountId", "Selecciona cuenta destino");
    else if (transferAccountId === accountId) {
      v.reject("transferAccountId", "La cuenta destino debe ser distinta del origen");
    }
  } else if (!categoryId) {
    v.reject("categoryId", "Selecciona una categoría");
  }

  v.throwIfInvalid();

  // Las cuentas implicadas tienen que ser del usuario y estar vivas.
  const accountIds = [accountId, ...(transferAccountId ? [transferAccountId] : [])];
  const owned = await db
    .select({ id: walletAccounts.id })
    .from(walletAccounts)
    .where(
      and(
        eq(walletAccounts.userId, userId),
        isNull(walletAccounts.deletedAt),
        inArray(walletAccounts.id, accountIds),
      ),
    );
  if (owned.length !== accountIds.length) {
    throw new ValidationError({ accountId: "Cuenta inexistente" });
  }

  if (categoryId && type !== "TRANSFER") {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.userId, userId),
          isNull(categories.deletedAt),
        ),
      );
    if (!cat) {
      throw new ValidationError({ categoryId: "Categoría inexistente" });
    }
  }

  // Las transferencias nunca se enlazan a presupuestos (§8.2).
  let validBudgetIds: string[] = [];
  if (type !== "TRANSFER" && budgetIds.length > 0) {
    const ownedBudgets = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, userId),
          isNull(budgets.deletedAt),
          inArray(budgets.id, budgetIds),
        ),
      );
    validBudgetIds = ownedBudgets.map((b) => b.id);
    if (validBudgetIds.length !== budgetIds.length) {
      throw new ValidationError({ budgetIds: "Algún presupuesto no existe" });
    }
  }

  return {
    id,
    amount,
    type,
    categoryId: type === "TRANSFER" ? null : categoryId,
    accountId,
    transferAccountId: type === "TRANSFER" ? transferAccountId : null,
    note,
    date,
    budgetIds: validBudgetIds,
  };
}

app.post("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const parsed = await parseTransaction(db, userId, await c.req.json());
  const now = Date.now();

  if (parsed.type === "TRANSFER") {
    // Las dos patas nacen juntas, con el mismo grupo y en el mismo batch.
    const groupId = uuidv7(now);
    const base = {
      userId,
      amount: parsed.amount,
      type: "TRANSFER" as const,
      categoryId: null,
      transferGroupId: groupId,
      note: parsed.note,
      date: parsed.date,
      createdAt: now,
      updatedAt: now,
    };

    await db.batch([
      db.insert(transactions).values({
        ...base,
        id: parsed.id,
        accountId: parsed.accountId,
        transferAccountId: parsed.transferAccountId,
        isOutgoing: true,
      }),
      db.insert(transactions).values({
        ...base,
        id: uuidv7(now),
        accountId: parsed.transferAccountId!,
        transferAccountId: parsed.accountId,
        isOutgoing: false,
      }),
    ]);

    return c.json({ id: parsed.id, transferGroupId: groupId }, 201);
  }

  const statements: Statement[] = [
    db.insert(transactions).values({
      id: parsed.id,
      userId,
      amount: parsed.amount,
      type: parsed.type,
      categoryId: parsed.categoryId,
      accountId: parsed.accountId,
      transferAccountId: null,
      transferGroupId: null,
      note: parsed.note,
      date: parsed.date,
      isOutgoing: false,
      createdAt: now,
      updatedAt: now,
    }),
    ...budgetLinkStatements(db, parsed.id, parsed.budgetIds),
  ];
  await runBatch(db, statements);

  return c.json({ id: parsed.id }, 201);
});

app.put("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");
  const parsed = await parseTransaction(db, userId, await c.req.json());
  const now = Date.now();

  const [existing] = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      transferGroupId: transactions.transferGroupId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    );

  if (!existing) return c.json({ error: "Transacción no encontrada" }, 404);

  // Filas hermanas del grupo, si la que se edita era una transferencia.
  const groupRows = existing.transferGroupId
    ? await db
        .select({ id: transactions.id, isOutgoing: transactions.isOutgoing })
        .from(transactions)
        .where(
          and(
            eq(transactions.transferGroupId, existing.transferGroupId),
            eq(transactions.userId, userId),
            isNull(transactions.deletedAt),
          ),
        )
        .orderBy(asc(transactions.isOutgoing))
    : [];

  const statements: Statement[] = [];

  if (parsed.type === "TRANSFER") {
    const groupId = existing.transferGroupId ?? uuidv7(now);
    const shared = {
      amount: parsed.amount,
      type: "TRANSFER" as const,
      categoryId: null,
      transferGroupId: groupId,
      note: parsed.note,
      date: parsed.date,
      updatedAt: now,
    };

    const outgoing = groupRows.find((r) => r.isOutgoing);
    const incoming = groupRows.find((r) => !r.isOutgoing);

    // La pata saliente: la que ya lo era, o la fila que se está editando si
    // antes esto no era una transferencia.
    const outgoingId = outgoing?.id ?? id;
    statements.push(
      db
        .update(transactions)
        .set({
          ...shared,
          accountId: parsed.accountId,
          transferAccountId: parsed.transferAccountId,
          isOutgoing: true,
        })
        .where(and(eq(transactions.id, outgoingId), eq(transactions.userId, userId))),
    );

    // La pata entrante: se actualiza si existía; si no (porque la transacción
    // acaba de convertirse en transferencia), se crea.
    if (incoming) {
      statements.push(
        db
          .update(transactions)
          .set({
            ...shared,
            accountId: parsed.transferAccountId!,
            transferAccountId: parsed.accountId,
            isOutgoing: false,
          })
          .where(and(eq(transactions.id, incoming.id), eq(transactions.userId, userId))),
      );
    } else {
      statements.push(
        db.insert(transactions).values({
          ...shared,
          id: uuidv7(now),
          userId,
          accountId: parsed.transferAccountId!,
          transferAccountId: parsed.accountId,
          isOutgoing: false,
          createdAt: now,
        }),
      );
    }

    // Una transferencia nunca queda enlazada a presupuestos.
    statements.push(
      db
        .delete(transactionBudgetRef)
        .where(eq(transactionBudgetRef.transactionId, outgoingId)),
    );
  } else {
    // Deja de ser transferencia (o nunca lo fue). Si tenía pata hermana, hay que
    // borrarla: dejarla viva inflaría para siempre el balance de la otra cuenta,
    // que es exactamente lo que hacía la app Android.
    for (const row of groupRows) {
      if (row.id !== id) {
        statements.push(
          db
            .update(transactions)
            .set({ deletedAt: now, updatedAt: now })
            .where(and(eq(transactions.id, row.id), eq(transactions.userId, userId))),
        );
      }
    }

    statements.push(
      db
        .update(transactions)
        .set({
          amount: parsed.amount,
          type: parsed.type,
          categoryId: parsed.categoryId,
          accountId: parsed.accountId,
          transferAccountId: null,
          transferGroupId: null,
          note: parsed.note,
          date: parsed.date,
          isOutgoing: false,
          updatedAt: now,
        })
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId))),
      db.delete(transactionBudgetRef).where(eq(transactionBudgetRef.transactionId, id)),
      ...budgetLinkStatements(db, id, parsed.budgetIds),
    );
  }

  await runBatch(db, statements);
  return c.json({ id });
});

/**
 * Borrado lógico. Si es una transferencia, se van **las dos** patas.
 *
 * En Android se borraba solo la fila cargada y la hermana quedaba huérfana,
 * inflando el balance de la cuenta contraria de forma permanente (§8.2).
 */
app.delete("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");
  const now = Date.now();

  const [existing] = await db
    .select({ id: transactions.id, transferGroupId: transactions.transferGroupId })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    );

  if (!existing) return c.json({ error: "Transacción no encontrada" }, 404);

  const scope = existing.transferGroupId
    ? eq(transactions.transferGroupId, existing.transferGroupId)
    : eq(transactions.id, id);

  await db
    .update(transactions)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(scope, eq(transactions.userId, userId)));

  return c.json({ id });
});

/** Enlaces transacción → presupuesto, uno por presupuesto. */
function budgetLinkStatements(
  db: Db,
  transactionId: string,
  budgetIds: string[],
): Statement[] {
  return budgetIds.map((budgetId) =>
    db
      .insert(transactionBudgetRef)
      .values({ transactionId, budgetId })
      .onConflictDoNothing(),
  );
}

export default app;
