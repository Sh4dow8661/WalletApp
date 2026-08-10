import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Account,
  AccountInput,
  Budget,
  BudgetInput,
  Category,
  CategoryInput,
  CategorySpend,
  DailySpend,
  DashboardSummary,
  FixedExpense,
  FixedExpenseImportInput,
  FixedExpenseImportResult,
  FixedExpenseInputDto,
  MarkPaidResult,
  MonthlyTrendPoint,
  ReconcileInput,
  ReconcileResult,
  Transaction,
  TransactionInput,
  UserSettings,
  UserSettingsInput,
} from "@/shared/types.ts";

import { api, queryString } from "../lib/api.ts";
import { MUTACIONES } from "./mutaciones.ts";

/**
 * Acceso a datos con TanStack Query.
 *
 * Sustituye a los `Flow` de Room: donde en Android la UI se re-renderizaba sola
 * al cambiar la base, aquí se invalidan las claves afectadas tras cada mutación
 * y Query vuelve a pedir lo que haga falta.
 */

export const claves = {
  cuentas: ["accounts"] as const,
  categorias: ["categories"] as const,
  transacciones: (filtros?: FiltrosTransacciones) =>
    filtros ? (["transactions", filtros] as const) : (["transactions"] as const),
  presupuestos: ["budgets"] as const,
  gastosFijos: ["fixed-expenses"] as const,
  ajustes: ["settings"] as const,
  estadisticas: ["stats"] as const,
  panel: (year?: number, month?: number) => ["stats", "dashboard", year, month] as const,
  porCategoria: (year?: number, month?: number) =>
    ["stats", "by-category", year, month] as const,
  tendencia: (year?: number, month?: number) => ["stats", "trend", year, month] as const,
  diario: (year?: number, month?: number) => ["stats", "daily", year, month] as const,
};

export interface FiltrosTransacciones {
  from?: number;
  to?: number;
  categoryId?: string;
  accountId?: string;
  limit?: number;
}

// --- Lecturas --------------------------------------------------------------

export function useAccounts() {
  return useQuery({
    queryKey: claves.cuentas,
    queryFn: () => api.get<Account[]>("/api/accounts"),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: claves.categorias,
    queryFn: () => api.get<Category[]>("/api/categories"),
  });
}

export function useTransactions(filtros: FiltrosTransacciones = {}) {
  return useQuery({
    queryKey: claves.transacciones(filtros),
    queryFn: () =>
      api.get<Transaction[]>(`/api/transactions${queryString({ ...filtros })}`),
  });
}

export function useTransaction(id: string | null) {
  return useQuery({
    queryKey: ["transactions", "detalle", id],
    queryFn: () => api.get<Transaction>(`/api/transactions/${id}`),
    enabled: id !== null,
  });
}

export function useBudgets() {
  return useQuery({
    queryKey: claves.presupuestos,
    queryFn: () => api.get<Budget[]>("/api/budgets"),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: claves.ajustes,
    queryFn: () => api.get<UserSettings>("/api/settings"),
  });
}

export function useDashboard(year?: number, month?: number) {
  return useQuery({
    queryKey: claves.panel(year, month),
    queryFn: () =>
      api.get<DashboardSummary>(`/api/stats/dashboard${queryString({ year, month })}`),
  });
}

export function useSpendByCategory(year?: number, month?: number) {
  return useQuery({
    queryKey: claves.porCategoria(year, month),
    queryFn: () =>
      api.get<CategorySpend[]>(`/api/stats/by-category${queryString({ year, month })}`),
  });
}

export function useMonthlyTrend(year?: number, month?: number) {
  return useQuery({
    queryKey: claves.tendencia(year, month),
    queryFn: () =>
      api.get<MonthlyTrendPoint[]>(`/api/stats/trend${queryString({ year, month })}`),
  });
}

export function useDailySpend(year?: number, month?: number) {
  return useQuery({
    queryKey: claves.diario(year, month),
    queryFn: () =>
      api.get<DailySpend[]>(`/api/stats/daily${queryString({ year, month })}`),
  });
}

// --- Escrituras ------------------------------------------------------------

/**
 * Invalida todo lo que depende del dinero.
 *
 * Se invalida de más a propósito: una transacción cambia balances, presupuestos
 * y los cuatro agregados a la vez, y afinar qué clave concreta se vio afectada
 * costaría más de lo que ahorra. Son consultas pequeñas contra el mismo Worker.
 */
function useInvalidarDatos() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: claves.cuentas });
    void queryClient.invalidateQueries({ queryKey: claves.presupuestos });
    void queryClient.invalidateQueries({ queryKey: claves.gastosFijos });
    void queryClient.invalidateQueries({ queryKey: claves.estadisticas });
  };
}

export function useSaveAccount() {
  const invalidar = useInvalidarDatos();
  const queryClient = useQueryClient();

  return useMutation<
    { id: string },
    Error,
    AccountInput & { id?: string; nuevoId?: string }
  >({
    // La función vive en mutaciones.ts, registrada bajo esta clave: es lo que
    // permite reanudar la escritura tras una recarga (§9).
    mutationKey: MUTACIONES.guardarCuenta,
    onSuccess: () => {
      invalidar();
      void queryClient.invalidateQueries({ queryKey: claves.categorias });
    },
  });
}

export function useDeleteAccount() {
  const invalidar = useInvalidarDatos();
  return useMutation<{ id: string }, Error, string>({
    mutationKey: MUTACIONES.borrarCuenta,
    onSuccess: invalidar,
  });
}

/** Duplica varias transacciones a una fecha. Nunca toca las originales. */
export function useDuplicateTransactions() {
  const invalidar = useInvalidarDatos();
  return useMutation<{ ids: string[] }, Error, { ids: string[]; date: number }>({
    mutationKey: MUTACIONES.duplicarTransacciones,
    onSuccess: invalidar,
  });
}

// ---------------------------------------------------------------------------
// Gastos fijos
// ---------------------------------------------------------------------------

export function useFixedExpenses() {
  return useQuery({
    queryKey: claves.gastosFijos,
    queryFn: () => api.get<FixedExpense[]>("/api/fixed-expenses"),
  });
}

export function useSaveFixedExpense() {
  const invalidar = useInvalidarDatos();
  return useMutation<
    { id: string },
    Error,
    FixedExpenseInputDto & { id?: string; nuevoId?: string }
  >({
    mutationKey: MUTACIONES.guardarGastoFijo,
    onSuccess: invalidar,
  });
}

export function useDeleteFixedExpense() {
  const invalidar = useInvalidarDatos();
  return useMutation<{ id: string }, Error, string>({
    mutationKey: MUTACIONES.borrarGastoFijo,
    onSuccess: invalidar,
  });
}

/**
 * Importa gastos fijos pegados desde la hoja de cálculo.
 *
 * Además de los gastos puede crear categorías, así que invalida también esa
 * clave: si no, la pantalla seguiría sin conocer las categorías recién creadas
 * y los gastos importados saldrían como «sin categoría» hasta recargar.
 */
export function useImportFixedExpenses() {
  const queryClient = useQueryClient();
  const invalidar = useInvalidarDatos();

  return useMutation<FixedExpenseImportResult, Error, FixedExpenseImportInput>({
    mutationKey: MUTACIONES.importarGastosFijos,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: claves.categorias });
      invalidar();
    },
  });
}

/** Marca un gasto fijo como pagado: crea la transacción y avanza el ciclo. */
export function useMarkFixedExpensePaid() {
  const invalidar = useInvalidarDatos();
  return useMutation<MarkPaidResult, Error, { id: string; transactionId?: string }>({
    mutationKey: MUTACIONES.pagarGastoFijo,
    onSuccess: invalidar,
  });
}

/** Cuadre contra el saldo real: crea la transacción de ajuste (§8.3 bis). */
export function useReconcileAccount() {
  const invalidar = useInvalidarDatos();
  return useMutation<ReconcileResult, Error, ReconcileInput & { id: string }>({
    mutationKey: MUTACIONES.cuadrarCuenta,
    onSuccess: invalidar,
  });
}

export function useSaveCategory() {
  const queryClient = useQueryClient();
  const invalidar = useInvalidarDatos();

  return useMutation<
    { id: string },
    Error,
    CategoryInput & { id?: string; nuevoId?: string }
  >({
    mutationKey: MUTACIONES.guardarCategoria,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: claves.categorias });
      invalidar();
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  const invalidar = useInvalidarDatos();

  return useMutation<{ id: string }, Error, string>({
    mutationKey: MUTACIONES.borrarCategoria,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: claves.categorias });
      invalidar();
    },
  });
}

export function useSaveTransaction() {
  const invalidar = useInvalidarDatos();
  return useMutation<
    { id: string },
    Error,
    TransactionInput & { id?: string; nuevoId?: string }
  >({
    mutationKey: MUTACIONES.guardarTransaccion,
    onSuccess: invalidar,
  });
}

export function useDeleteTransaction() {
  const invalidar = useInvalidarDatos();
  return useMutation<{ id: string }, Error, string>({
    mutationKey: MUTACIONES.borrarTransaccion,
    onSuccess: invalidar,
  });
}

export function useSaveBudget() {
  const invalidar = useInvalidarDatos();
  return useMutation<
    { id: string },
    Error,
    BudgetInput & { id?: string; nuevoId?: string }
  >({
    mutationKey: MUTACIONES.guardarPresupuesto,
    onSuccess: invalidar,
  });
}

export function useDeleteBudget() {
  const invalidar = useInvalidarDatos();
  return useMutation<{ id: string }, Error, string>({
    mutationKey: MUTACIONES.borrarPresupuesto,
    onSuccess: invalidar,
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation<UserSettings, Error, UserSettingsInput>({
    mutationKey: MUTACIONES.guardarAjustes,
    onSuccess: (ajustes) => {
      queryClient.setQueryData(claves.ajustes, ajustes);
      // La zona horaria cambia TODOS los agregados por día y por mes (§8.6).
      void queryClient.invalidateQueries({ queryKey: claves.estadisticas });
    },
  });
}
