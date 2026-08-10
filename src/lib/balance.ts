import type { TransactionType } from "@/shared/constants.ts";

/**
 * Cálculo de balances. Portado de `TransactionDao.observeAccountBalanceDelta` y
 * `AccountRepositoryImpl`.
 *
 * La misma regla de signos se aplica en dos sitios: aquí (para el cliente, que
 * necesita recalcular sin red) y en SQL dentro del Worker. Si cambias una,
 * cambia la otra — hay un test que compara ambas.
 */

/** Lo mínimo que hace falta de una transacción para calcular su efecto. */
export interface BalanceInput {
  amount: number;
  type: TransactionType;
  /** En una transferencia: true en la pata que sale, false en la que entra. */
  isOutgoing: boolean;
}

/**
 * Efecto de una transacción sobre el balance de **su** cuenta (`account_id`).
 *
 * - `INCOME` suma.
 * - `EXPENSE` resta.
 * - `TRANSFER` con `isOutgoing = true` resta (el dinero sale de esta cuenta).
 * - `TRANSFER` con `isOutgoing = false` suma (el dinero entra en esta cuenta).
 *
 * Las dos patas de una transferencia son filas distintas, cada una asociada a su
 * propia cuenta, así que basta con mirar `account_id` y `is_outgoing`.
 */
export function transactionDelta(tx: BalanceInput): number {
  switch (tx.type) {
    case "INCOME":
      return tx.amount;
    case "EXPENSE":
      return -tx.amount;
    case "TRANSFER":
      return tx.isOutgoing ? -tx.amount : tx.amount;
  }
}

/** Suma neta de un conjunto de transacciones de una misma cuenta. */
export function balanceDelta(transactions: readonly BalanceInput[]): number {
  return transactions.reduce((sum, tx) => sum + transactionDelta(tx), 0);
}

/** Balance actual de una cuenta: su balance inicial más el neto de movimientos. */
export function accountBalance(
  initialBalance: number,
  transactions: readonly BalanceInput[],
): number {
  return initialBalance + balanceDelta(transactions);
}

/**
 * Balance total del dashboard. Solo suma las cuentas con `includeInTotal`
 * (§8.1); las excluidas siguen apareciendo en la lista con su propio saldo.
 */
export function totalBalance(
  accounts: readonly { currentBalance: number; includeInTotal: boolean }[],
): number {
  return accounts
    .filter((a) => a.includeInTotal)
    .reduce((sum, a) => sum + a.currentBalance, 0);
}

/**
 * Balance inicial que hay que guardar cuando el usuario **edita** una cuenta.
 *
 * Al editar, el campo de la UI es el balance ACTUAL deseado, no el inicial: para
 * conservarlo hay que despejar `initial = tecleado − Σ(movimientos)` (§8.3).
 * Al **crear** una cuenta el campo sí es el inicial y esta función no se usa.
 *
 * Referencia: `AddEditAccountViewModel.save()`.
 */
export function initialBalanceForDesiredCurrent(
  desiredCurrentBalance: number,
  transactionsDelta: number,
): number {
  return desiredCurrentBalance - transactionsDelta;
}
