import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";

import { initialBalanceForDesiredCurrent } from "@/lib/balance.ts";
import { uuidv7 } from "@/lib/id.ts";
import { ACCOUNT_TYPES, ICON_NAMES, type AccountType } from "@/shared/constants.ts";
import type { Account } from "@/shared/types.ts";

import type { AppEnv } from "../context.ts";
import { accountBalanceDelta, accountCurrentBalance } from "../db/queries.ts";
import { transactions, walletAccounts } from "../db/schema.ts";
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
      colorHex,
      iconName,
      includeInTotal,
      updatedAt: Date.now(),
    })
    .where(and(eq(walletAccounts.id, id), eq(walletAccounts.userId, userId)));

  return c.json({ id });
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
