import { type BufferInput, effectiveBuffer, hasActiveBuffer } from "./colchon.ts";
import { type CreditInput, cardDebt, isCreditCard } from "./credit.ts";

/**
 * Patrimonio: una sola cuenta de la verdad para la cabecera, el Dashboard y la
 * pantalla de Cuentas.
 *
 * Antes cada pantalla sumaba lo suyo y enseñaban cifras distintas del mismo
 * concepto. Ahora las tres llaman aquí, así que **no pueden discrepar**.
 *
 * ## Las dos preguntas, que son distintas
 *
 *     puedoGastarHoy  = activos − colchones
 *     disponibleReal  = activos − colchones − deuda de tarjetas
 *
 * La primera contesta «cuánto puedo gastar hoy sin tocar mis colchones». La
 * segunda, «cuánto tengo de verdad», y para eso la deuda de la tarjeta cuenta:
 * es dinero que ya se debe aunque todavía no haya salido de la cuenta. Se
 * enseñan las dos porque responden a cosas diferentes.
 *
 * `disponibleReal` puede salir muy negativo. Es la realidad y se muestra tal
 * cual, en rojo: taparlo sería justo lo contrario de para lo que sirve.
 */

export type PatrimonioInput = BufferInput & CreditInput;

export interface Patrimonio {
  /** Suma de las cuentas que no son tarjeta. */
  assets: number;
  /** Suma de los colchones activos. */
  reserved: number;
  /** Suma de la deuda de las tarjetas. */
  cardDebt: number;
  /** Activos − colchones. Lo gastable hoy sin tocar el colchón. */
  spendableToday: number;
  /** Activos − colchones − deuda. Lo que se tiene de verdad. */
  realAvailable: number;
  /** Activos − deuda, sin descontar colchones (el dinero sigue siendo tuyo). */
  net: number;
  /** Si es false, no hay colchones y la UI no debe mencionarlos. */
  hasAnyBuffer: boolean;
  /** Si es false, no hay deuda de tarjetas y sobra hablar de ella. */
  hasCardDebt: boolean;
}

/**
 * Calcula el patrimonio a partir de las cuentas.
 *
 * **`includeInTotal` se respeta también en las tarjetas** (§8.1). La regla es
 * «esta cuenta no entra en mis totales», y una tarjeta excluida no debe sumar
 * deuda igual que una cuenta excluida no suma saldo: si contase la deuda pero
 * no el saldo, el flag significaría una cosa distinta según el tipo de cuenta,
 * que es justo la clase de sorpresa que hay que evitar. La tarjeta sigue
 * apareciendo en su lista con su propia utilización.
 */
export function summarizeNetWorth(accounts: readonly PatrimonioInput[]): Patrimonio {
  let assets = 0;
  let reserved = 0;
  let deuda = 0;
  let hasAnyBuffer = false;

  for (const cuenta of accounts) {
    if (!cuenta.includeInTotal) continue;

    if (isCreditCard(cuenta)) {
      deuda += cardDebt(cuenta);
      continue;
    }

    assets += cuenta.currentBalance;
    reserved += effectiveBuffer(cuenta);
    if (hasActiveBuffer(cuenta)) hasAnyBuffer = true;
  }

  const spendableToday = assets - reserved;

  return {
    assets,
    reserved,
    cardDebt: deuda,
    spendableToday,
    realAvailable: spendableToday - deuda,
    net: assets - deuda,
    hasAnyBuffer,
    hasCardDebt: deuda > 0,
  };
}

/** Una línea del desglose que se enseña bajo la cifra. */
export interface LineaDesglose {
  etiqueta: string;
  importe: number;
  /** Cómo entra en la cuenta: se suma o se resta. */
  signo: "mas" | "menos" | "resultado";
}

/**
 * Desglose auditable: de dónde sale el número.
 *
 * Se omiten las líneas que valen cero para no llenar la pantalla de ruido en
 * quien no usa colchones ni tiene tarjetas.
 */
export function desglosarDisponibleReal(p: Patrimonio): LineaDesglose[] {
  const lineas: LineaDesglose[] = [
    { etiqueta: "Activos", importe: p.assets, signo: "mas" },
  ];

  if (p.reserved > 0) {
    lineas.push({ etiqueta: "Colchones", importe: p.reserved, signo: "menos" });
  }
  if (p.cardDebt > 0) {
    lineas.push({ etiqueta: "Deuda de tarjetas", importe: p.cardDebt, signo: "menos" });
  }

  lineas.push({
    etiqueta: "Disponible real",
    importe: p.realAvailable,
    signo: "resultado",
  });
  return lineas;
}
