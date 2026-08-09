/**
 * Constantes compartidas entre el frontend y el Worker.
 *
 * Todo lo de este archivo está portado literalmente de la app Android. Si un
 * valor cambia aquí, deja de coincidir con los datos que ya están guardados
 * (los iconos y colores se persisten por nombre y por hex, no por índice).
 */

/** Monedas admitidas. De `CurrencyFormatter.supportedCurrencies`, en su orden. */
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "MXN",
  "ARS",
  "COP",
  "CLP",
  "PEN",
  "BRL",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "INR",
  "KRW",
  "RUB",
  "TRY",
  "ZAR",
  "NOK",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Nombres de icono admitidos. De `IconMapper.options`.
 * El nombre es lo que se guarda en la base de datos; el mapeo a un icono de
 * lucide vive en el componente CategoryIcon, no aquí.
 */
export const ICON_NAMES = [
  "Restaurant",
  "DirectionsCar",
  "Home",
  "Movie",
  "LocalHospital",
  "ShoppingCart",
  "School",
  "Lightbulb",
  "Category",
  "Work",
  "Computer",
  "CardGiftcard",
  "TrendingUp",
  "AttachMoney",
  "Payments",
  "AccountBalance",
  "CreditCard",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** Icono al que se cae cuando el nombre guardado no se reconoce. */
export const FALLBACK_ICON: IconName = "Category";

/** Paleta de categorías, de `CategoryPalette` en Color.kt. */
export const CATEGORY_PALETTE = [
  "#FF7043",
  "#42A5F5",
  "#8D6E63",
  "#AB47BC",
  "#EF5350",
  "#EC407A",
  "#5C6BC0",
  "#FFA726",
  "#66BB6A",
  "#26A69A",
  "#29B6F6",
  "#9CCC65",
  "#78909C",
  "#D4E157",
  "#FF8A65",
] as const;

/** Tipos de cuenta monetaria. */
export const ACCOUNT_TYPES = ["CASH", "BANK", "CREDIT_CARD"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Tipos de transacción. */
export const TRANSACTION_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Tipos de categoría. Las transferencias nunca llevan categoría. */
export const CATEGORY_TYPES = ["INCOME", "EXPENSE"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

/** Recurrencia de un presupuesto, de `BudgetRecurrence`. */
export const BUDGET_RECURRENCES = ["NONE", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export type BudgetRecurrence = (typeof BUDGET_RECURRENCES)[number];

/** Etiquetas en español de la recurrencia, como en la app Android. */
export const BUDGET_RECURRENCE_LABELS: Record<BudgetRecurrence, string> = {
  NONE: "Una vez",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
};

/** Modo de tema. */
export const THEME_MODES = ["LIGHT", "DARK", "SYSTEM"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/**
 * Zona horaria por defecto de una cuenta nueva.
 * Es UTC−4 sin horario de verano. Todo agregado por día o por mes se calcula en
 * la zona del usuario, nunca en UTC: agrupar en UTC es justo el bug que arrastra
 * la app Android en el heatmap del calendario (§8.6).
 */
export const DEFAULT_TIME_ZONE = "America/Puerto_Rico";

/** Moneda por defecto de una cuenta nueva, igual que en `SettingsDataStore`. */
export const DEFAULT_CURRENCY: CurrencyCode = "USD";

/** Icono por defecto de cada tipo de cuenta, de `AddEditAccountViewModel.setType`. */
export const DEFAULT_ACCOUNT_ICON: Record<AccountType, IconName> = {
  CASH: "Payments",
  BANK: "AccountBalance",
  CREDIT_CARD: "CreditCard",
};
