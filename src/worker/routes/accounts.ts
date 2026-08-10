import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";

import { initialBalanceForDesiredCurrent } from "@/lib/balance.ts";
import { reconcile } from "@/lib/colchon.ts";
import { uuidv7 } from "@/lib/id.ts";
import { ACCOUNT_TYPES, ICON_NAMES, type AccountType } from "@/shared/constants.ts";
import type { Account } from "@/shared/types.ts";

import type { AppEnv } from "../context.ts";
import { accountBalanceDelta, accountCurrentBalance } from "../db/queries.ts";
import { categories, transactions, walletAccounts } from "../db/schema.ts";
import { Validator } from "../validation.ts";

/**
 * CRUD de cuentas monetarias.
 *
 * Toda consulta filtra por el `userId` de la sesión y por `deleted_at IS NULL`.
 */
const app = new Hono<AppEnv>();

/** Columnas que se devuelven, con el balance actual ya calculado. */
const selection = {
  id: walletAccounts.id,
  name: walletAccounts.name,
  type: walletAccounts.type,
  initialBalance: walletAccounts.initialBalance,
  currentBalance: accountCurrentBalance(),
  creditLimit: walletAccounts.creditLimit,
  bufferAmount: walletAccounts.bufferAmount,
  bufferApplied: walletAccounts.bufferApplied,
  lastReconciledAt: walletAccounts.lastReconciledAt,
  colorHex: walletAccounts.colorHex,
  iconName: walletAccounts.iconName,
  includeInTotal: walletAccounts.includeInTotal,
  createdAt: walletAccounts.createdAt,
  updatedAt: walletAccounts.updatedAt,
};

/**
 * Límite de crédito, con las dos reglas que no caben en el esquema.
 *
 * 1. Solo una `CREDIT_CARD` puede tenerlo. Mandarlo en una cuenta de efectivo
 *    no es un descuido inofensivo: significa que el cliente entendió mal el
 *    modelo, así que se rechaza en vez de ignorarlo en silencio.
 * 2. Si viene, tiene que ser > 0. Un 0 haría dividir por cero al calcular la
 *    utilización; el CHECK de la migración 0002 lo respalda en la base.
 *
 * Ausente o `null` significa «sin límite configurado», que es válido: la UI
 * enseña ese estado en vez de inventarse un porcentaje.
 */
function creditLimitOf(v: Validator, type: AccountType): number | null {
  const limite = v.nullableNumber("creditLimit");
  if (limite === null) return null;

  if (type !== "CREDIT_CARD") {
    v.reject("creditLimit", "Solo las tarjetas de crédito tienen límite");
    return null;
  }
  if (limite <= 0) {
    v.reject("creditLimit", "El límite debe ser mayor que cero");
    return null;
  }
  return limite;
}

/**
 * Colchón de una cuenta.
 *
 * No se acepta en tarjetas: ahí no hay un saldo del que apartar una parte, sino
 * deuda. Como en el límite de crédito, mandarlo igualmente se rechaza en vez de
 * ignorarse, porque significa que el cliente entendió mal el modelo.
 */
function bufferOf(v: Validator, type: AccountType): { amount: number; applied: boolean } {
  const amount = v.nullableNumber("bufferAmount", { min: 0 }) ?? 0;
  const applied = v.boolean("bufferApplied", true);

  if (amount > 0 && type === "CREDIT_CARD") {
    v.reject("bufferAmount", "Una tarjeta de crédito no lleva colchón");
    return { amount: 0, applied };
  }
  return { amount, applied };
}

app.get("/", async (c) => {
  const rows = await c
    .get("db")
    .select(selection)
    .from(walletAccounts)
    .where(
      and(eq(walletAccounts.userId, c.get("userId")), isNull(walletAccounts.deletedAt)),
    )
    .orderBy(asc(walletAccounts.createdAt));

  return c.json(rows as Account[]);
});

app.get("/:id", async (c) => {
  const [row] = await c
    .get("db")
    .select(selection)
    .from(walletAccounts)
    .where(
      and(
        eq(walletAccounts.id, c.req.param("id")),
        eq(walletAccounts.userId, c.get("userId")),
        isNull(walletAccounts.deletedAt),
      ),
    );

  if (!row) return c.json({ error: "Cuenta no encontrada" }, 404);
  return c.json(row as Account);
});

app.post("/", async (c) => {
  const v = new Validator(await c.req.json());
  const id = v.optionalId("id") ?? uuidv7();
  const name = v.requiredString("name", 100);
  const type = v.enum("type", ACCOUNT_TYPES);
  // Al CREAR, el campo `balance` es el balance inicial tal cual (§8.3).
  const initialBalance = v.number("balance");
  const creditLimit = creditLimitOf(v, type);
  const buffer = bufferOf(v, type);
  const colorHex = v.colorHex("colorHex");
  const iconName = v.enum("iconName", ICON_NAMES);
  const includeInTotal = v.boolean("includeInTotal", true);
  v.throwIfInvalid();

  const now = Date.now();
  await c
    .get("db")
    .insert(walletAccounts)
    .values({
      id,
      userId: c.get("userId"),
      name,
      type,
      initialBalance,
      creditLimit,
      bufferAmount: buffer.amount,
      bufferApplied: buffer.applied,
      colorHex,
      iconName,
      includeInTotal,
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
  const name = v.requiredString("name", 100);
  const type = v.enum("type", ACCOUNT_TYPES);
  // Al EDITAR, `balance` es el balance ACTUAL deseado, no el inicial.
  const desiredCurrentBalance = v.number("balance");
  const creditLimit = creditLimitOf(v, type);
  const buffer = bufferOf(v, type);
  const colorHex = v.colorHex("colorHex");
  const iconName = v.enum("iconName", ICON_NAMES);
  const includeInTotal = v.boolean("includeInTotal", true);
  v.throwIfInvalid();

  const [existing] = await db
    .select({ delta: accountBalanceDelta() })
    .from(walletAccounts)
    .where(
      and(
        eq(walletAccounts.id, id),
        eq(walletAccounts.userId, userId),
        isNull(walletAccounts.deletedAt),
      ),
    );

  if (!existing) return c.json({ error: "Cuenta no encontrada" }, 404);

  // §8.3: se despeja el inicial para que el balance actual sea el que se tecleó.
  // El delta se lee en la misma petición, no se fía de lo que mande el cliente.
  const initialBalance = initialBalanceForDesiredCurrent(
    desiredCurrentBalance,
    existing.delta,
  );

  await db
    .update(walletAccounts)
    .set({
      name,
      type,
      initialBalance,
      // Al pasar una tarjeta a otro tipo, `creditLimitOf` devuelve null y el
      // límite se limpia: dejarlo colgado significaría que una cuenta de banco
      // arrastra un límite invisible que reaparecería al volver a tarjeta.
      creditLimit,
      bufferAmount: buffer.amount,
      bufferApplied: buffer.applied,
      colorHex,
      iconName,
      includeInTotal,
      updatedAt: Date.now(),
    })
    .where(and(eq(walletAccounts.id, id), eq(walletAccounts.userId, userId)));

  return c.json({ id });
});

/**
 * Cuadre contra el saldo real.
 *
 * El usuario teclea lo que su cuenta tiene de verdad (lo que ve en el banco) y
 * la app crea una **transacción de ajuste** por la diferencia.
 *
 * Ojo, esto NO es lo mismo que editar el «balance actual» de la cuenta (§8.3),
 * que sigue existiendo: aquello despeja el balance inicial y el cuadre queda
 * invisible en el historial. Aquí la diferencia se registra como un movimiento
 * más, con su fecha y su nota, y se puede ver, editar o borrar después. Para un
 * cuadre periódico es lo que se quiere; el otro camino sirve para corregir el
 * punto de partida de una cuenta recién creada.
 *
 * Si ya cuadraba no se crea nada: solo se apunta la fecha del cuadre.
 */
app.post("/:id/reconcile", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");

  const v = new Validator(await c.req.json());
  const realBalance = v.number("realBalance");
  const applyBuffer = v.boolean("applyBuffer", true);
  const adjustmentId = v.optionalId("adjustmentId") ?? uuidv7();
  v.throwIfInvalid();

  // El balance calculado se lee aquí, en la misma petición: fiarse del que
  // mande el cliente permitiría cuadrar contra una cifra ya caducada.
  const [cuenta] = await db
    .select({ current: accountCurrentBalance(), type: walletAccounts.type })
    .from(walletAccounts)
    .where(
      and(
        eq(walletAccounts.id, id),
        eq(walletAccounts.userId, userId),
        isNull(walletAccounts.deletedAt),
      ),
    );

  if (!cuenta) return c.json({ error: "Cuenta no encontrada" }, 404);

  const resultado = reconcile(cuenta.current, realBalance);
  const now = Date.now();

  // El colchón no se toca en las tarjetas, así que tampoco se recuerda ahí.
  const cambios =
    cuenta.type === "CREDIT_CARD"
      ? { lastReconciledAt: now, updatedAt: now }
      : { bufferApplied: applyBuffer, lastReconciledAt: now, updatedAt: now };

  if (!resultado.needsAdjustment) {
    await db
      .update(walletAccounts)
      .set(cambios)
      .where(and(eq(walletAccounts.id, id), eq(walletAccounts.userId, userId)));

    return c.json({
      calculated: resultado.calculated,
      real: resultado.real,
      difference: 0,
      adjustmentId: null,
      reconciledAt: now,
    });
  }

  // La categoría del ajuste: «Otros» del tipo que toque, que es la que existe
  // por defecto en toda cuenta sembrada. Si el usuario la borró, el ajuste va
  // sin categoría antes que fallar el cuadre entero.
  const [categoria] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.name, "Otros"),
        eq(categories.type, resultado.adjustmentType!),
        isNull(categories.deletedAt),
      ),
    );

  await db.batch([
    db.insert(transactions).values({
      id: adjustmentId,
      userId,
      amount: resultado.adjustmentAmount,
      type: resultado.adjustmentType!,
      categoryId: categoria?.id ?? null,
      accountId: id,
      transferAccountId: null,
      transferGroupId: null,
      note: "Ajuste de cuadre",
      date: now,
      isOutgoing: false,
      createdAt: now,
      updatedAt: now,
    }),
    db
      .update(walletAccounts)
      .set(cambios)
      .where(and(eq(walletAccounts.id, id), eq(walletAccounts.userId, userId))),
  ]);

  return c.json({
    calculated: resultado.calculated,
    real: resultado.real,
    difference: resultado.difference,
    adjustmentId,
    reconciledAt: now,
  });
});

/**
 * Borrado lógico de la cuenta y de sus transacciones.
 *
 * En Android la FK tenía ON DELETE CASCADE, así que borrar una cuenta se llevaba
 * por delante sus transacciones. Con borrado lógico esa cascada no se dispara
 * sola: hay que marcarlas aquí, o quedarían colgando y seguirían contando en los
 * totales de gasto e ingreso del mes.
 *
 * Va en un batch para que no pueda quedar la cuenta borrada y las transacciones
 * vivas. La UI avisa antes de confirmar (§8.7).
 */
app.delete("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");
  const now = Date.now();

  const [existing] = await db
    .select({ id: walletAccounts.id })
    .from(walletAccounts)
    .where(
      and(
        eq(walletAccounts.id, id),
        eq(walletAccounts.userId, userId),
        isNull(walletAccounts.deletedAt),
      ),
    );

  if (!existing) return c.json({ error: "Cuenta no encontrada" }, 404);

  await db.batch([
    db
      .update(transactions)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
          sql`(${transactions.accountId} = ${id} OR ${transactions.transferAccountId} = ${id})`,
        ),
      ),
    db
      .update(walletAccounts)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(walletAccounts.id, id), eq(walletAccounts.userId, userId))),
  ]);

  return c.json({ id });
});

export default app;
