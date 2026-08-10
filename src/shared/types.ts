import type {
  AccountType,
  BudgetRecurrence,
  CategoryType,
  CurrencyCode,
  IconName,
  ThemeMode,
  TransactionType,
} from "./constants.ts";

/**
 * Contrato del API, compartido entre el Worker y el frontend.
 *
 * Los identificadores son UUID v7 en texto y los instantes, epoch millis.
 * Ningún DTO de entrada lleva `userId`: el servidor lo toma siempre de la
 * sesión (§7). Si llega uno en el cuerpo, se ignora.
 */

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Balance de partida, ya reconciliado (§8.3). */
  initialBalance: number;
  /** `initialBalance` más el neto de movimientos. Lo calcula el servidor. */
  currentBalance: number;
  colorHex: string;
  iconName: IconName;
  includeInTotal: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AccountInput {
  /** Lo genera el cliente para que la cola offline no colisione. */
  id?: string;
  name: string;
  type: AccountType;
  /**
   * Al **crear** es el balance inicial. Al **editar** es el balance ACTUAL
   * deseado y el servidor despeja el inicial (§8.3).
   */
  balance: number;
  colorHex: string;
  iconName: IconName;
  includeInTotal: boolean;
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  iconName: IconName;
  colorHex: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CategoryInput {
  id?: string;
  name: string;
  type: CategoryType;
  iconName: IconName;
  colorHex: string;
}

// ---------------------------------------------------------------------------
// Transacciones
// ---------------------------------------------------------------------------

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  categoryId: string | null;
  accountId: string;
  transferAccountId: string | null;
  /** Une las dos patas de una transferencia. null si no lo es (§8.2). */
  transferGroupId: string | null;
  note: string;
  date: number;
  isOutgoing: boolean;
  /** Presupuestos enlazados a mano. Vacío en las transferencias (§8.4). */
  budgetIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TransactionInput {
  id?: string;
  amount: number;
  type: TransactionType;
  /** Obligatorio en INCOME y EXPENSE; siempre null en TRANSFER. */
  categoryId?: string | null;
  accountId: string;
  /** Obligatorio y distinto de accountId en TRANSFER. */
  transferAccountId?: string | null;
  note?: string;
  date: number;
  /** Ignorado en las transferencias: no se enlazan a presupuestos. */
  budgetIds?: string[];
}

// ---------------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------------

export interface Budget {
  id: string;
  name: string;
  amount: number;
  startDate: number;
  endDate: number;
  recurrence: BudgetRecurrence;

  /** Gasto neto del período actual: gastos enlazados menos ingresos (§8.4). */
  spent: number;
  periodStart: number;
  periodEnd: number;

  // Derivados que muestra la UI (§8.4). Los calcula el servidor para que
  // cliente y servidor no puedan discrepar.
  progress: number;
  remaining: number;
  overspent: number;
  isOverBudget: boolean;
  isNearLimit: boolean;
  isActive: boolean;
  daysRemaining: number;
  periodDurationDays: number;
  suggestedDailySpend: number;
  averageDailySpend: number;

  createdAt: number;
  updatedAt: number;
}

export interface BudgetInput {
  id?: string;
  name: string;
  amount: number;
  startDate: number;
  endDate: number;
  recurrence: BudgetRecurrence;
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

export interface UserSettings {
  currency: CurrencyCode;
  themeMode: ThemeMode;
  /** Zona IANA. El servidor la usa para todo agregado por día o mes (§8.6). */
  timeZone: string;
  updatedAt: number;
}

export type UserSettingsInput = Partial<Omit<UserSettings, "updatedAt">>;

// ---------------------------------------------------------------------------
// Agregados
// ---------------------------------------------------------------------------

/** Resumen del dashboard. */
export interface DashboardSummary {
  /** Solo cuentas con includeInTotal (§8.1). */
  totalBalance: number;
  monthIncome: number;
  monthExpense: number;
  year: number;
  month: number;
  monthLabel: string;
}

export interface CategorySpend {
  categoryId: string | null;
  total: number;
}

/** Un punto del gráfico de tendencia de 6 meses. */
export interface MonthlyTrendPoint {
  year: number;
  month: number;
  /** Etiqueta abreviada, p. ej. "ago". */
  label: string;
  total: number;
}

/** Un día del mapa de calor del calendario. Agrupado por día LOCAL (§8.6). */
export interface DailySpend {
  /** `yyyy-MM-dd` en la zona del usuario. */
  day: string;
  total: number;
}

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  /** Detalle por campo, cuando el fallo es de validación. */
  fields?: Record<string, string>;
}
