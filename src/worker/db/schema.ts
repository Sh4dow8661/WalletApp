import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import type {
  AccountType,
  BudgetRecurrence,
  CategoryType,
  CurrencyCode,
  IconName,
  ThemeMode,
  TransactionType,
} from "@/shared/constants.ts";

/**
 * Esquema de D1. La fuente de verdad del DDL son los archivos de `migrations/`
 * (§7 pide migraciones de D1 desde el día uno); esto es la vista tipada que usa
 * el código. Si cambias uno, cambia el otro.
 *
 * Tres diferencias respecto al Room de la app Android:
 *
 * 1. Todas las tablas llevan `userId`. La app es multiusuario ahora. El `userId`
 *    sale SIEMPRE de la sesión en el servidor, nunca del cuerpo de la petición.
 * 2. Los IDs son TEXT (UUID v7) y no INTEGER AUTOINCREMENT, para que el cliente
 *    pueda crear filas offline sin colisionar. Ver src/lib/id.ts.
 * 3. `accounts` pasa a `wallet_accounts`: Better Auth ya usa `account` para los
 *    proveedores OAuth.
 *
 * Las marcas de tiempo son epoch millis en INTEGER, igual que en Room.
 * `deletedAt` es borrado lógico: toda consulta de lectura filtra por
 * `deletedAt IS NULL`.
 */

// Las tablas de Better Auth (user, session, account, verification) las genera su
// CLI en auth-schema.ts. Se re-exportan para que el adaptador de Drizzle y las
// consultas del dominio vean un único esquema.
export * from "./auth-schema.ts";

/** Cuentas monetarias del usuario (efectivo, banco, tarjeta). */
export const walletAccounts = sqliteTable(
  "wallet_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    /** CASH | BANK | CREDIT_CARD */
    type: text("type").$type<AccountType>().notNull(),
    /**
     * Balance de partida. Ojo: al **editar** una cuenta la UI muestra el balance
     * ACTUAL y este campo se recalcula como `tecleado − Σ(transacciones)`
     * (§8.3). Al crear, es el balance inicial tal cual.
     */
    initialBalance: real("initial_balance").notNull().default(0),
    /**
     * Límite de crédito, solo en `CREDIT_CARD`. Null = sin configurar, y
     * entonces la app no calcula utilización en vez de inventarse un
     * porcentaje. Que solo lo lleven las tarjetas lo impone `routes/accounts.ts`
     * (no cabe en un CHECK de columna, ver la migración 0002).
     */
    creditLimit: real("credit_limit"),
    colorHex: text("color_hex").notNull(),
    iconName: text("icon_name").$type<IconName>().notNull(),
    /** Si es false, la cuenta no suma al balance total del dashboard (§8.1). */
    includeInTotal: integer("include_in_total", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("idx_wallet_accounts_user").on(t.userId)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    /** INCOME | EXPENSE. Las transferencias nunca llevan categoría. */
    type: text("type").$type<CategoryType>().notNull(),
    iconName: text("icon_name").$type<IconName>().notNull(),
    colorHex: text("color_hex").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("idx_categories_user").on(t.userId)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    amount: real("amount").notNull(),
    /** INCOME | EXPENSE | TRANSFER */
    type: text("type").$type<TransactionType>().notNull(),
    categoryId: text("category_id"),
    accountId: text("account_id").notNull(),
    transferAccountId: text("transfer_account_id"),
    /**
     * Une las dos filas de una transferencia. No existe en la app Android, y su
     * ausencia es justo la causa del bug de §8.2: al editar o borrar solo se
     * tocaba una pata. Aquí crear, editar y borrar operan sobre el grupo entero
     * dentro de un mismo batch de D1.
     */
    transferGroupId: text("transfer_group_id"),
    note: text("note").notNull().default(""),
    /** Epoch millis. Medianoche LOCAL del usuario, nunca UTC (§8.6). */
    date: integer("date").notNull(),
    /** En una transferencia: true en la pata que sale, false en la que entra. */
    isOutgoing: integer("is_outgoing", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    index("idx_tx_user_date").on(t.userId, t.date),
    index("idx_tx_account").on(t.accountId),
    index("idx_tx_category").on(t.categoryId),
    index("idx_tx_transfer_group").on(t.transferGroupId),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    amount: real("amount").notNull(),
    /** Ancla del primer período. En los recurrentes fija el día/hora de corte. */
    startDate: integer("start_date").notNull(),
    endDate: integer("end_date").notNull(),
    /** NONE | WEEKLY | BIWEEKLY | MONTHLY */
    recurrence: text("recurrence").$type<BudgetRecurrence>().notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("idx_budgets_user").on(t.userId)],
);

/**
 * Enlace manual N:M entre transacción y presupuesto.
 *
 * No hay matching automático por categoría ni por cuenta: eso se eliminó en la
 * migración 4→5 de Room. Cada transacción se enlaza a mano a 0, 1 o varios
 * presupuestos (§8.4).
 */
export const transactionBudgetRef = sqliteTable(
  "transaction_budget_ref",
  {
    transactionId: text("transaction_id").notNull(),
    budgetId: text("budget_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.budgetId] }),
    index("idx_tbr_budget").on(t.budgetId),
  ],
);

/** Sustituye a SettingsDataStore. Una fila por usuario. */
export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id").primaryKey(),
  currency: text("currency").$type<CurrencyCode>().notNull().default("USD"),
  /** LIGHT | DARK | SYSTEM */
  themeMode: text("theme_mode").$type<ThemeMode>().notNull().default("SYSTEM"),
  /**
   * Zona IANA del usuario. El servidor la usa para TODO agregado por día o por
   * mes. Agrupar en UTC es el bug del heatmap de §8.6.
   */
  timeZone: text("time_zone").notNull().default("America/Puerto_Rico"),
  updatedAt: integer("updated_at").notNull(),
});

export type WalletAccountRow = typeof walletAccounts.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type BudgetRow = typeof budgets.$inferSelect;
export type TransactionBudgetRefRow = typeof transactionBudgetRef.$inferSelect;
export type UserSettingsRow = typeof userSettings.$inferSelect;
