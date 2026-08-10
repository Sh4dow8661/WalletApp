import { isCreditCard } from "./credit.ts";

import type { AccountType } from "@/shared/constants.ts";

/**
 * Colchón por cuenta y disponible real.
 *
 * Un **colchón** es dinero que está en la cuenta pero que no se quiere gastar:
 * el mínimo que no debe bajar. La cuenta lo sigue teniendo —el balance no
 * cambia— pero deja de contar como disponible:
 *
 *     disponible = balance − colchón
 *
 * Por eso la app enseña SIEMPRE las dos cifras cuando hay colchón. Enseñar solo
 * el disponible escondería dinero que existe de verdad, y enseñar solo el
 * balance es justo lo que hace creer que hay más de lo que se puede gastar.
 *
 * En una TARJETA el colchón no significa nada: no hay un saldo propio del que
 * apartar una parte, sino una deuda. Nunca se aplica ni se ofrece.
 */

/** Lo mínimo que hace falta de una cuenta para estos cálculos. */
export interface BufferInput {
  type: AccountType;
  currentBalance: number;
  /** Mínimo que no se quiere tocar. 0 = sin colchón. */
  bufferAmount: number;
  /** Si está apagado, el colchón se guarda pero no se descuenta. */
  bufferApplied: boolean;
  includeInTotal: boolean;
}

/**
 * ¿Esta cuenta tiene un colchón que de verdad afecte a lo disponible?
 *
 * Con colchón 0, apagado, o en una tarjeta, la respuesta es no: la UI no debe
 * enseñar ni una palabra de más. Un colchón de 0 tiene que comportarse
 * exactamente igual que antes de que esta función existiera.
 */
export function hasActiveBuffer(account: BufferInput): boolean {
  return !isCreditCard(account) && account.bufferApplied && account.bufferAmount > 0;
}

/** Colchón que se descuenta de verdad. 0 si no aplica. */
export function effectiveBuffer(account: BufferInput): number {
  return hasActiveBuffer(account) ? account.bufferAmount : 0;
}

/**
 * Disponible real de una cuenta.
 *
 * **Puede salir negativo** y se devuelve tal cual, sin recortarlo a 0: si el
 * colchón es mayor que el balance, el usuario está por debajo de su propio
 * mínimo y eso es exactamente lo que necesita ver (la UI lo pinta en rojo).
 * Recortarlo a 0 ocultaría el problema.
 */
export function availableBalance(account: BufferInput): number {
  return account.currentBalance - effectiveBuffer(account);
}

/** true cuando el colchón se ha comido el saldo: hay que avisar. */
export function isBelowBuffer(account: BufferInput): boolean {
  return hasActiveBuffer(account) && availableBalance(account) < 0;
}

export interface AvailabilitySummary {
  /** Suma de los disponibles: el total que de verdad se puede gastar. */
  available: number;
  /** Suma de los colchones activos. */
  reserved: number;
  /** Cuántas cuentas están por debajo de su colchón. */
  accountsBelowBuffer: number;
  /** Si es false, no hay ningún colchón y la UI no debe añadir ruido. */
  hasAnyBuffer: boolean;
}

/**
 * Disponible total y cuánto queda retenido.
 *
 * Solo entran las cuentas con `includeInTotal` (§8.1) y **no entran las
 * tarjetas**: su deuda ya se trata aparte en `credit.ts`, y meterla aquí
 * mezclaría otra vez dinero con deuda.
 */
export function summarizeAvailability(
  accounts: readonly BufferInput[],
): AvailabilitySummary {
  let available = 0;
  let reserved = 0;
  let accountsBelowBuffer = 0;
  let hasAnyBuffer = false;

  for (const cuenta of accounts) {
    if (!cuenta.includeInTotal || isCreditCard(cuenta)) continue;

    available += availableBalance(cuenta);
    reserved += effectiveBuffer(cuenta);
    if (hasActiveBuffer(cuenta)) hasAnyBuffer = true;
    if (isBelowBuffer(cuenta)) accountsBelowBuffer += 1;
  }

  return { available, reserved, accountsBelowBuffer, hasAnyBuffer };
}

// ---------------------------------------------------------------------------
// Cuadre
// ---------------------------------------------------------------------------

/**
 * Resultado de comparar el saldo real con el que la app había calculado.
 *
 * `difference = real − calculado`:
 * - positivo → falta dinero por registrar, el ajuste es un INGRESO;
 * - negativo → sobra dinero registrado, el ajuste es un GASTO;
 * - cero → nada que hacer, y NO se crea ninguna transacción.
 */
export interface Reconciliation {
  calculated: number;
  real: number;
  difference: number;
  /** Falso cuando no hay diferencia: no hay que crear nada. */
  needsAdjustment: boolean;
  adjustmentType: "INCOME" | "EXPENSE" | null;
  /** Importe del ajuste, siempre positivo (el tipo lleva el signo). */
  adjustmentAmount: number;
}

/**
 * Céntimos. Por debajo de esto la diferencia se considera cero.
 *
 * Los balances son `REAL` y se suman en coma flotante, así que restar dos
 * cifras que "deberían" ser iguales puede dar 1e−13. Sin este umbral, cuadrar
 * una cuenta ya cuadrada crearía una transacción de ajuste de 0,0000000000001.
 */
const EPSILON = 0.005;

/**
 * Redondeo a céntimos.
 *
 * El importe del ajuste se guarda como una transacción más, y el usuario la va
 * a ver en su historial. Sin esto, restar dos `REAL` deja cosas como
 * `45.900000000000006` escritas para siempre en su lista de movimientos.
 *
 * El precio es que el saldo puede quedar a menos de medio céntimo del real —
 * por debajo de EPSILON, así que el siguiente cuadre lo dará por cuadrado y no
 * se acumula.
 */
function aCentimos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function reconcile(calculated: number, real: number): Reconciliation {
  const difference = real - calculated;
  const needsAdjustment = Math.abs(difference) >= EPSILON;

  return {
    calculated,
    real,
    difference: aCentimos(difference),
    needsAdjustment,
    adjustmentType: !needsAdjustment ? null : difference > 0 ? "INCOME" : "EXPENSE",
    adjustmentAmount: needsAdjustment ? aCentimos(Math.abs(difference)) : 0,
  };
}

/**
 * Disponible que quedará tras aceptar el cuadre.
 *
 * Es lo que se enseña en vivo mientras se teclea el saldo real, para que la
 * decisión se tome viendo el número que va a quedar, no el que había.
 */
export function availableAfterReconcile(
  real: number,
  bufferAmount: number,
  applyBuffer: boolean,
): number {
  return real - (applyBuffer ? bufferAmount : 0);
}
