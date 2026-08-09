import { uuidv7 } from "@/lib/id.ts";
import { DEFAULT_TIME_ZONE } from "@/shared/constants.ts";
import type { AccountType, CategoryType, IconName } from "@/shared/constants.ts";

/**
 * Datos por defecto del primer arranque. Portados literalmente de
 * `data/local/DefaultData.kt`: mismos nombres, mismos colores, mismos iconos y
 * en el mismo orden.
 *
 * Se siembran al **registrarse** (§11), no al abrir la app: cada usuario
 * arranca con sus propias 3 cuentas y 14 categorías.
 */

interface SeedAccount {
  name: string;
  type: AccountType;
  colorHex: string;
  iconName: IconName;
}

interface SeedCategory {
  name: string;
  type: CategoryType;
  iconName: IconName;
  colorHex: string;
}

/** Las 3 cuentas de `DefaultData.defaultAccounts`, todas con balance 0. */
export const DEFAULT_ACCOUNTS: readonly SeedAccount[] = [
  { name: "Efectivo", type: "CASH", colorHex: "#4CAF50", iconName: "Payments" },
  { name: "Banco", type: "BANK", colorHex: "#2196F3", iconName: "AccountBalance" },
  {
    name: "Tarjeta de Crédito",
    type: "CREDIT_CARD",
    colorHex: "#F44336",
    iconName: "CreditCard",
  },
];

/** Las 9 categorías de gasto de `DefaultData.defaultExpenseCategories`. */
export const DEFAULT_EXPENSE_CATEGORIES: readonly SeedCategory[] = [
  { name: "Comida", type: "EXPENSE", iconName: "Restaurant", colorHex: "#FF7043" },
  { name: "Transporte", type: "EXPENSE", iconName: "DirectionsCar", colorHex: "#42A5F5" },
  { name: "Vivienda", type: "EXPENSE", iconName: "Home", colorHex: "#8D6E63" },
  { name: "Entretenimiento", type: "EXPENSE", iconName: "Movie", colorHex: "#AB47BC" },
  { name: "Salud", type: "EXPENSE", iconName: "LocalHospital", colorHex: "#EF5350" },
  { name: "Compras", type: "EXPENSE", iconName: "ShoppingCart", colorHex: "#EC407A" },
  { name: "Educación", type: "EXPENSE", iconName: "School", colorHex: "#5C6BC0" },
  { name: "Servicios", type: "EXPENSE", iconName: "Lightbulb", colorHex: "#FFA726" },
  { name: "Otros", type: "EXPENSE", iconName: "Category", colorHex: "#78909C" },
];

/** Las 5 categorías de ingreso de `DefaultData.defaultIncomeCategories`. */
export const DEFAULT_INCOME_CATEGORIES: readonly SeedCategory[] = [
  { name: "Salario", type: "INCOME", iconName: "Work", colorHex: "#66BB6A" },
  { name: "Freelance", type: "INCOME", iconName: "Computer", colorHex: "#26A69A" },
  { name: "Regalos", type: "INCOME", iconName: "CardGiftcard", colorHex: "#EC407A" },
  { name: "Intereses", type: "INCOME", iconName: "TrendingUp", colorHex: "#29B6F6" },
  { name: "Otros", type: "INCOME", iconName: "AttachMoney", colorHex: "#9CCC65" },
];

export const ALL_DEFAULT_CATEGORIES: readonly SeedCategory[] = [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES,
];

/**
 * Siembra las cuentas, categorías y ajustes iniciales de un usuario recién
 * registrado.
 *
 * Va en un único `batch` de D1: o entra todo o no entra nada. Un usuario a
 * medio sembrar (con cuentas pero sin categorías) dejaría la app inservible,
 * porque no se puede crear un gasto sin categoría.
 */
export async function seedNewUser(
  db: D1Database,
  userId: string,
  now: number,
): Promise<void> {
  const statements: D1PreparedStatement[] = [];

  const insertAccount = db.prepare(
    `INSERT INTO wallet_accounts
       (id, user_id, name, type, initial_balance, color_hex, icon_name,
        include_in_total, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, 1, ?, ?)`,
  );
  for (const a of DEFAULT_ACCOUNTS) {
    statements.push(
      insertAccount.bind(
        uuidv7(now),
        userId,
        a.name,
        a.type,
        a.colorHex,
        a.iconName,
        now,
        now,
      ),
    );
  }

  const insertCategory = db.prepare(
    `INSERT INTO categories
       (id, user_id, name, type, icon_name, color_hex, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  for (const c of ALL_DEFAULT_CATEGORIES) {
    statements.push(
      insertCategory.bind(
        uuidv7(now),
        userId,
        c.name,
        c.type,
        c.iconName,
        c.colorHex,
        now,
        now,
      ),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO user_settings (user_id, currency, theme_mode, time_zone, updated_at)
         VALUES (?, 'USD', 'SYSTEM', ?, ?)`,
      )
      .bind(userId, DEFAULT_TIME_ZONE, now),
  );

  await db.batch(statements);
}
