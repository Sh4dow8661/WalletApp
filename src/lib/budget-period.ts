import type { BudgetRecurrence } from "@/shared/constants.ts";

import { MS_PER_DAY, addMonths, daysBetween, zonedParts, zonedTime } from "./dates.ts";

/**
 * Períodos de presupuesto. Portado de `BudgetPeriod.currentPeriod` en
 * `domain/model/Budget.kt`, **con una corrección deliberada**.
 *
 * ## El bug del original
 *
 * En Android el fin del período se calculaba como `inicio + 1 mes − 1 ms`.
 * Cuando el inicio venía recortado (ancla el 31, febrero solo llega al 28), el
 * fin se recortaba con él, pero el período siguiente volvía a saltar al día 31.
 * Los días de en medio no pertenecían a ningún período.
 *
 * Medido en la JVM con ancla el 31-ene-2026: los días 28, 29 y 30 de marzo y el
 * 30 de mayo caían en un hueco. Un gasto de esos días, enlazado a ese
 * presupuesto, no se contaba nunca.
 *
 * ## La corrección
 *
 * El período termina **el instante anterior al inicio del siguiente**, no un mes
 * después del suyo. Así los períodos son contiguos por construcción y todo día
 * pertenece exactamente a uno. La contrapartida es que un período puede durar
 * más de un mes natural (con ancla el 31, el de febrero va del 28-feb al
 * 30-mar): es inevitable si se quiere anclar a fin de mes sin dejar huecos.
 */

export interface Period {
  /** Primer instante del período, inclusive. */
  start: number;
  /** Último instante del período, inclusive. */
  end: number;
}

/**
 * Período que contiene a `now` para un presupuesto.
 *
 * @param startDate Ancla. En los recurrentes fija el día del mes y la hora de corte.
 * @param endDate   Solo se usa cuando la recurrencia es NONE.
 * @param timeZone  Zona del usuario. Nunca la de la máquina (§8.6).
 */
export function currentPeriod(
  startDate: number,
  endDate: number,
  recurrence: BudgetRecurrence,
  now: number,
  timeZone: string,
): Period {
  if (recurrence === "NONE") return { start: startDate, end: endDate };

  // Un presupuesto que aún no ha empezado muestra su primer período.
  if (now < startDate) return firstPeriod(startDate, recurrence, timeZone);

  switch (recurrence) {
    case "WEEKLY":
      return rollingPeriod(startDate, now, 7);
    case "BIWEEKLY":
      return rollingPeriod(startDate, now, 14);
    case "MONTHLY":
      return monthlyPeriod(startDate, now, timeZone);
  }
}

/** Primer período, para cuando `now` es anterior al inicio. */
function firstPeriod(
  startDate: number,
  recurrence: BudgetRecurrence,
  timeZone: string,
): Period {
  switch (recurrence) {
    case "WEEKLY":
      return { start: startDate, end: startDate + 7 * MS_PER_DAY - 1 };
    case "BIWEEKLY":
      return { start: startDate, end: startDate + 14 * MS_PER_DAY - 1 };
    case "MONTHLY": {
      const anchor = zonedParts(startDate, timeZone);
      const next = addMonths(anchor.year, anchor.month, 1);
      return {
        start: startDate,
        end: anchorAt(anchor, next.year, next.month, timeZone) - 1,
      };
    }
    case "NONE":
      return { start: startDate, end: startDate };
  }
}

/**
 * Períodos rodantes de N días anclados en `startDate`. Portado literal del
 * original: aritmética de milisegundos, sin ajuste por horario de verano. En
 * `America/Puerto_Rico` no hay DST, así que no cambia nada; en una zona con DST
 * el corte se movería una hora, igual que en la app Android.
 */
function rollingPeriod(startDate: number, now: number, daysPerPeriod: number): Period {
  const periodMs = daysPerPeriod * MS_PER_DAY;
  const periodIndex = Math.floor((now - startDate) / periodMs);
  const start = startDate + periodIndex * periodMs;
  return { start, end: start + periodMs - 1 };
}

/**
 * Período mensual anclado al día del mes de `startDate`, recortado al último día
 * disponible cuando el mes es más corto.
 */
function monthlyPeriod(startDate: number, now: number, timeZone: string): Period {
  const anchor = zonedParts(startDate, timeZone);
  const current = zonedParts(now, timeZone);

  let { year, month } = current;
  // Si el corte de este mes aún no ha llegado, seguimos en el período anterior.
  if (anchorAt(anchor, year, month, timeZone) > now) {
    ({ year, month } = addMonths(year, month, -1));
  }

  const start = anchorAt(anchor, year, month, timeZone);
  const next = addMonths(year, month, 1);
  // Aquí está la corrección: el fin se deriva del inicio del período SIGUIENTE,
  // no de "un mes después del propio inicio".
  const end = anchorAt(anchor, next.year, next.month, timeZone) - 1;

  return { start, end };
}

/** Instante del corte en un mes concreto, con el día recortado si hace falta. */
function anchorAt(
  anchor: ReturnType<typeof zonedParts>,
  year: number,
  month: number,
  timeZone: string,
): number {
  return zonedTime(
    {
      year,
      month,
      day: anchor.day,
      hour: anchor.hour,
      minute: anchor.minute,
      second: anchor.second,
      ms: anchor.ms,
    },
    timeZone,
  );
}

// ---------------------------------------------------------------------------
// Derivados que muestra la UI. Portados de `domain/model/Budget.kt`.
// ---------------------------------------------------------------------------

export interface BudgetMetrics {
  /** 0..1, acotado. */
  progress: number;
  /** Dinero que queda, nunca negativo. */
  remaining: number;
  /** Cuánto se pasó, nunca negativo. */
  overspent: number;
  isOverBudget: boolean;
  /** Al 80% o más, pero sin haberse pasado. */
  isNearLimit: boolean;
  daysRemaining: number;
  periodDurationDays: number;
  /** Cuánto se puede gastar al día sin pasarse en lo que queda. */
  suggestedDailySpend: number;
  /** Media gastada por día hasta ahora. */
  averageDailySpend: number;
}

/**
 * Calcula los derivados de un presupuesto.
 *
 * Dos detalles del original que hay que conservar o los números cambian:
 * - `daysRemaining` es 0 en cuanto `now` pasa del fin del período.
 * - `daysElapsed` tiene un mínimo de 1. Sin ese suelo, `averageDailySpend`
 *   sería una división por cero el primer día del período.
 */
export function budgetMetrics(
  amount: number,
  spent: number,
  period: Period,
  now: number,
  timeZone: string,
): BudgetMetrics {
  const progress = amount > 0 ? Math.min(Math.max(spent / amount, 0), 1) : 0;
  const remaining = Math.max(amount - spent, 0);
  const overspent = Math.max(spent - amount, 0);
  const isOverBudget = spent > amount;

  const daysRemaining =
    now > period.end ? 0 : Math.max(daysBetween(now, period.end, timeZone) + 1, 0);
  const periodDurationDays = Math.max(
    daysBetween(period.start, period.end, timeZone) + 1,
    1,
  );
  const daysElapsed = Math.max(periodDurationDays - daysRemaining, 1);

  return {
    progress,
    remaining,
    overspent,
    isOverBudget,
    isNearLimit: progress >= 0.8 && !isOverBudget,
    daysRemaining,
    periodDurationDays,
    suggestedDailySpend: daysRemaining > 0 ? remaining / daysRemaining : 0,
    averageDailySpend: spent / daysElapsed,
  };
}

/**
 * ¿Está activo el presupuesto? Los recurrentes lo están desde su inicio y para
 * siempre; los de una sola vez, solo dentro de su rango.
 */
export function isBudgetActive(
  startDate: number,
  endDate: number,
  recurrence: BudgetRecurrence,
  now: number,
): boolean {
  return recurrence === "NONE" ? now >= startDate && now <= endDate : now >= startDate;
}
