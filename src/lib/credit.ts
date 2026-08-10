import type { AccountType } from "@/shared/constants.ts";

/**
 * Utilización de las tarjetas de crédito.
 *
 * CONVENCIÓN DE SIGNOS — importante, y no se inventa aquí: la fija `balance.ts`.
 * Un `EXPENSE` resta del balance de su cuenta, así que gastar con una tarjeta la
 * deja con **balance negativo**. Por tanto, en una tarjeta:
 *
 *     deuda = −balance   (cuando el balance es negativo)
 *
 * Un balance positivo en una tarjeta significa saldo a favor (un pago de más o
 * una devolución), no deuda: ahí la deuda es 0, nunca un número negativo.
 *
 * El límite es dinero disponible, no dinero que se tiene: una tarjeta NUNCA
 * suma a los activos. Por eso el resumen separa activos de deuda en vez de
 * mezclarlos en un único total.
 */

/** Lo mínimo que hace falta de una cuenta para estos cálculos. */
export interface CreditInput {
  type: AccountType;
  currentBalance: number;
  /** Solo lo llevan las tarjetas, y puede faltar. */
  creditLimit: number | null;
  includeInTotal: boolean;
}

export function isCreditCard<T extends { type: AccountType }>(account: T): boolean {
  return account.type === "CREDIT_CARD";
}

/**
 * Deuda de una tarjeta, siempre >= 0.
 *
 * Se aplica solo a tarjetas: en una cuenta normal un balance negativo es un
 * descubierto, que es otra cosa y no se mide contra ningún límite.
 */
export function cardDebt(account: CreditInput): number {
  if (!isCreditCard(account)) return 0;
  return Math.max(0, -account.currentBalance);
}

/** Niveles del semáforo, de mejor a peor. */
export const CREDIT_LEVELS = ["excelente", "bien", "aviso", "malo", "critico"] as const;
export type CreditLevel = (typeof CREDIT_LEVELS)[number];

/**
 * Nivel a partir del porcentaje de utilización.
 *
 * Los cortes salen de la guía real de crédito: por debajo del 30 % no penaliza,
 * y por debajo del 10 % es lo ideal.
 *
 * El nivel se decide sobre el porcentaje YA REDONDEADO, el mismo número que se
 * enseña en pantalla. Si se decidiera sobre el exacto, un 29,6 % se mostraría
 * como «30 %» junto al texto «por debajo del 30 % recomendado», que es una
 * contradicción visible para quien lo lee.
 */
export function creditLevel(roundedPercent: number): CreditLevel {
  if (roundedPercent < 10) return "excelente";
  if (roundedPercent < 30) return "bien";
  if (roundedPercent < 50) return "aviso";
  if (roundedPercent < 80) return "malo";
  return "critico";
}

/**
 * Texto de cada nivel.
 *
 * El color NO puede ser el único portador del mensaje: quien no distingue el
 * verde del rojo tiene que enterarse igual (§10, accesibilidad). Por eso cada
 * nivel lleva su etiqueta corta y su explicación.
 */
export const CREDIT_LEVEL_LABELS: Record<CreditLevel, string> = {
  excelente: "Excelente",
  bien: "Bien",
  aviso: "Atención",
  malo: "Alto",
  critico: "Crítico",
};

export const CREDIT_LEVEL_MESSAGES: Record<CreditLevel, string> = {
  excelente: "Por debajo del 10 %, que es lo ideal.",
  bien: "Por debajo del 30 % recomendado.",
  aviso: "Estás sobre el 30 % recomendado.",
  malo: "Uso alto: conviene bajarlo del 30 %.",
  critico: "Uso crítico. Esto pesa mucho en tu crédito.",
};

/** Utilización ya resuelta de una tarjeta. */
export interface CardUtilization {
  debt: number;
  limit: number | null;
  /**
   * Porcentaje redondeado a entero, o `null` si no hay límite configurado.
   * Puede pasar de 100 si la deuda supera el límite (sobregiro).
   */
  percent: number | null;
  level: CreditLevel | null;
  /** Cuánto queda por gastar. Nunca baja de 0 aunque haya sobregiro. */
  available: number | null;
  /** true cuando la deuda supera el límite. */
  isOverLimit: boolean;
}

/**
 * Utilización de una tarjeta.
 *
 * Sin límite configurado NO se inventa un porcentaje: se devuelve `percent:
 * null` y la UI enseña «sin límite configurado» con un enlace para ponerlo. Un
 * límite de 0 o negativo se trata igual que no tenerlo — dividir por él daría
 * infinito o un signo al revés.
 */
export function cardUtilization(account: CreditInput): CardUtilization {
  const debt = cardDebt(account);
  const limit =
    account.creditLimit !== null && account.creditLimit > 0 ? account.creditLimit : null;

  if (limit === null) {
    return {
      debt,
      limit: null,
      percent: null,
      level: null,
      available: null,
      isOverLimit: false,
    };
  }

  const percent = Math.round((debt / limit) * 100);
  return {
    debt,
    limit,
    percent,
    level: creditLevel(percent),
    available: Math.max(0, limit - debt),
    isOverLimit: debt > limit,
  };
}

/** Resumen agregado de todas las cuentas. */
export interface AccountsSummary {
  /** Suma de las cuentas que no son tarjeta. */
  assets: number;
  /** Suma de la deuda de todas las tarjetas. */
  debt: number;
  /** Activos menos deuda: lo que de verdad se tiene. */
  net: number;
  /** Utilización agregada, o null si ninguna tarjeta tiene límite. */
  totalPercent: number | null;
  totalLevel: CreditLevel | null;
  /** Suma de los límites de las tarjetas que sí lo tienen configurado. */
  totalLimit: number | null;
  /** Tarjetas sin límite: la UI avisa de que quedan fuera del porcentaje. */
  cardsWithoutLimit: number;
}

/**
 * Activos, deuda, neto y utilización agregada.
 *
 * Respeta `includeInTotal` (§8.1), la misma regla que ya usa el balance total
 * del dashboard: una cuenta excluida sigue viéndose en su lista con su saldo,
 * pero no entra en ningún agregado. Aplicar una regla distinta aquí haría que
 * la misma cuenta contase en una pantalla y no en otra.
 *
 * La utilización total se calcula sobre la suma de deudas y la suma de límites,
 * no promediando los porcentajes: una tarjeta de 10 000 al 50 % y otra de 100
 * al 0 % dan 49,5 % agregado, no 25 %.
 */
export function summarizeAccounts(accounts: readonly CreditInput[]): AccountsSummary {
  const contadas = accounts.filter((a) => a.includeInTotal);

  let assets = 0;
  let debt = 0;
  let totalLimit = 0;
  let debtWithLimit = 0;
  let cardsWithoutLimit = 0;

  for (const cuenta of contadas) {
    if (!isCreditCard(cuenta)) {
      assets += cuenta.currentBalance;
      continue;
    }

    const { debt: deudaTarjeta, limit } = cardUtilization(cuenta);
    debt += deudaTarjeta;

    if (limit === null) {
      cardsWithoutLimit += 1;
    } else {
      totalLimit += limit;
      // Solo entra en el porcentaje la deuda que tiene un límite contra el que
      // medirse; si no, el agregado saldría inflado sin motivo.
      debtWithLimit += deudaTarjeta;
    }
  }

  const totalPercent =
    totalLimit > 0 ? Math.round((debtWithLimit / totalLimit) * 100) : null;

  return {
    assets,
    debt,
    net: assets - debt,
    totalPercent,
    totalLevel: totalPercent === null ? null : creditLevel(totalPercent),
    totalLimit: totalLimit > 0 ? totalLimit : null,
    cardsWithoutLimit,
  };
}
