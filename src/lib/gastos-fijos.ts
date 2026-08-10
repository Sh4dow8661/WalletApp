import { MS_PER_DAY, addMonths, startOfDay, zonedParts, zonedTime } from "./dates.ts";

/**
 * Gastos fijos y su costo mensual equivalente.
 *
 * El problema que resuelve: no todo se paga cada mes. Un seguro de 600 al año
 * no cuesta 600 el mes que toca y 0 el resto — cuesta **50 al mes** que habría
 * que ir apartando. Esa es la cifra que hace falta para saber de verdad cuánto
 * se va en gastos fijos.
 *
 *     equivalente mensual = importe del recibo / cada cuántos meses se paga
 *
 * Son dos números distintos y se enseñan los dos: el equivalente mensual (lo
 * que habría que apartar cada mes) y lo que toca pagar **este** mes concreto,
 * que en un mes sin recibos es 0 aunque el equivalente sea alto.
 */

/** Lo mínimo que hace falta de un gasto fijo para estos cálculos. */
export interface FixedExpenseInput {
  amount: number;
  /** Cada cuántos meses se paga. 1 = mensual, 12 = anual. Siempre >= 1. */
  everyMonths: number;
  /** Próximo vencimiento, en epoch millis. */
  nextDueDate: number;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Costo mensual equivalente
// ---------------------------------------------------------------------------

/**
 * Equivalente mensual, SIN redondear.
 *
 * El redondeo se hace solo al pintar, nunca aquí. Si se redondease en el
 * cálculo, el total sería la suma de cifras ya recortadas: doce gastos de
 * 100 / 3 (33,3333…) darían 399,96 en vez de 400. Se prefiere que **el total
 * sea correcto** aunque la suma de lo que se ve en pantalla difiera en algún
 * céntimo del total que se enseña — un céntimo en una línea se perdona; un
 * total que no cuadra con la realidad, no.
 */
export function monthlyEquivalent(expense: FixedExpenseInput): number {
  return expense.amount / expense.everyMonths;
}

/**
 * Semanas por mes que usa la app: **4, no 4,33**.
 *
 * Es una decisión deliberada y no un descuido. Lo correcto en calendario sería
 * 365,25 / 12 / 7 ≈ 4,348, pero la hoja de cálculo del usuario —que es la
 * fuente de estos datos y donde él lee— divide entre 4. Usar aquí el número
 * «bueno» dejaría la app y el Excel discrepando en cada línea (556,25 / 4 =
 * 139,06 frente a 556,25 / 4,348 = 127,93) y la cifra dejaría de servirle para
 * comparar.
 *
 * Si algún día se quiere la conversión de calendario, hay que cambiarla en el
 * Excel y aquí a la vez, nunca solo en un lado.
 */
export const SEMANAS_POR_MES = 4;

/**
 * Equivalente semanal, derivado del mensual. Sin redondear, como el mensual.
 */
export function weeklyEquivalent(monthly: number): number {
  return monthly / SEMANAS_POR_MES;
}

// ---------------------------------------------------------------------------
// Vencimientos
// ---------------------------------------------------------------------------

/**
 * Avanza el vencimiento al siguiente ciclo.
 *
 * ## El caso del día 31
 *
 * Un recibo que vence el 31 de enero no puede vencer el 31 de febrero. Se
 * recorta al último día del mes (28, o 29 en bisiesto), igual que hacen los
 * períodos de presupuesto (§8.5) — reutiliza el mismo `zonedTime`.
 *
 * **La clave es que el ancla NO se pierde.** El día original (31) se guarda
 * aparte, en `anchor_day`, y se vuelve a usar en cada salto. Si se derivase del
 * último vencimiento, tras pasar por febrero el recibo se quedaría clavado en
 * el día 28 para siempre: enero 31 → febrero 28 → marzo 28 → abril 28… Con el
 * ancla guardada, la serie correcta es 31 → 28 → 31 → 30 → 31.
 *
 * Todo se calcula en la zona del usuario, nunca en UTC (§8.6).
 */
export function nextDueDate(
  currentDue: number,
  everyMonths: number,
  anchorDay: number,
  timeZone: string,
): number {
  const actual = zonedParts(currentDue, timeZone);
  const { year, month } = addMonths(actual.year, actual.month, everyMonths);

  // `zonedTime` recorta solo el día al último disponible del mes.
  return zonedTime({ year, month, day: anchorDay }, timeZone);
}

/**
 * Día del mes al que anclar un gasto nuevo.
 *
 * Se toma de la primera fecha de vencimiento que elige el usuario. A partir de
 * ahí no cambia, aunque algún ciclo caiga en un mes más corto.
 */
export function anchorDayFrom(dueDate: number, timeZone: string): number {
  return zonedParts(dueDate, timeZone).day;
}

/**
 * Días que faltan para el vencimiento. Negativo si ya venció.
 *
 * Se compara por DÍAS locales completos, no por milisegundos: un recibo que
 * vence hoy a las 00:00 tiene que decir «vence hoy», no «venció hace 14 horas».
 */
export function daysUntilDue(dueDate: number, now: number, timeZone: string): number {
  const inicioVencimiento = startOfDay(dueDate, timeZone);
  const inicioHoy = startOfDay(now, timeZone);
  return Math.round((inicioVencimiento - inicioHoy) / MS_PER_DAY);
}

/** Días dentro de los cuales un vencimiento se considera «próximo». */
export const DIAS_AVISO = 7;

export type DueStatus = "vencido" | "hoy" | "proximo" | "normal";

/**
 * Estado de un vencimiento.
 *
 * `hoy` se separa de `proximo` a propósito: «vence hoy» y «vence en 6 días» no
 * piden la misma reacción.
 */
export function dueStatus(dueDate: number, now: number, timeZone: string): DueStatus {
  const dias = daysUntilDue(dueDate, now, timeZone);
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoy";
  if (dias <= DIAS_AVISO) return "proximo";
  return "normal";
}

// ---------------------------------------------------------------------------
// Totales
// ---------------------------------------------------------------------------

export interface FixedExpensesSummary {
  /** Lo que habría que apartar cada mes por TODOS los gastos activos. */
  monthlyEquivalent: number;
  /** Lo que toca pagar de verdad en el mes consultado. */
  dueThisMonth: number;
  /** Cuántos recibos caen en ese mes. */
  countDueThisMonth: number;
  overdue: number;
  dueSoon: number;
}

/**
 * Totales del mes indicado.
 *
 * Los inactivos no cuentan para nada: siguen en la lista, pero ni suman al
 * equivalente ni avisan de vencimientos.
 *
 * `monthlyEquivalent` y `dueThisMonth` son **dos números distintos y los dos
 * hacen falta**: un mes sin recibos tiene `dueThisMonth` a 0 aunque haya 300
 * de equivalente mensual, y eso es exactamente lo que hay que ver para no
 * creer que ese mes sobra dinero.
 */
export function summarizeFixedExpenses(
  expenses: readonly FixedExpenseInput[],
  year: number,
  month: number,
  now: number,
  timeZone: string,
): FixedExpensesSummary {
  let equivalente = 0;
  let esteMes = 0;
  let cuantosEsteMes = 0;
  let vencidos = 0;
  let proximos = 0;

  for (const gasto of expenses) {
    if (!gasto.isActive) continue;

    equivalente += monthlyEquivalent(gasto);

    const partes = zonedParts(gasto.nextDueDate, timeZone);
    if (partes.year === year && partes.month === month) {
      esteMes += gasto.amount;
      cuantosEsteMes += 1;
    }

    const estado = dueStatus(gasto.nextDueDate, now, timeZone);
    if (estado === "vencido") vencidos += 1;
    else if (estado === "hoy" || estado === "proximo") proximos += 1;
  }

  return {
    monthlyEquivalent: equivalente,
    dueThisMonth: esteMes,
    countDueThisMonth: cuantosEsteMes,
    overdue: vencidos,
    dueSoon: proximos,
  };
}

// ---------------------------------------------------------------------------
// Orden
// ---------------------------------------------------------------------------

export type FixedExpenseSort = "vencimiento" | "costo";

/**
 * Ordena la lista.
 *
 * Los inactivos caen siempre al final, ordenen como ordenen: no vencen ni
 * cuestan, así que arriba solo estorbarían.
 */
export function sortFixedExpenses<T extends FixedExpenseInput>(
  expenses: readonly T[],
  sort: FixedExpenseSort,
): T[] {
  return [...expenses].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return sort === "vencimiento"
      ? a.nextDueDate - b.nextDueDate
      : monthlyEquivalent(b) - monthlyEquivalent(a);
  });
}

// ---------------------------------------------------------------------------
// Agrupación por categoría
// ---------------------------------------------------------------------------

/** Rótulo de los gastos que no tienen categoría asignada. */
export const SIN_CATEGORIA = "Sin categoría";

export interface FixedExpenseGroup<T> {
  /** null en el grupo de los que no tienen categoría. */
  categoryId: string | null;
  categoryName: string;
  expenses: T[];
  /** Suma de equivalentes mensuales de los ACTIVOS del grupo. */
  monthlyEquivalent: number;
}

/**
 * Agrupa por categoría con subtotales, que es como se lee la hoja de cálculo de
 * la que salen estos datos.
 *
 * Los grupos van de mayor a menor subtotal —lo caro primero, que es lo que se
 * mira— y el de «sin categoría» siempre al final, aunque sume mucho: es un
 * cajón de sastre, no una categoría de verdad.
 *
 * El subtotal solo cuenta los activos, igual que `summarizeFixedExpenses`, para
 * que la suma de los subtotales cuadre con el total de la cabecera.
 */
export function groupFixedExpensesByCategory<
  T extends FixedExpenseInput & { categoryId: string | null },
>(
  expenses: readonly T[],
  categoryName: (categoryId: string) => string | undefined,
  sort: FixedExpenseSort,
): FixedExpenseGroup<T>[] {
  const grupos = new Map<string, FixedExpenseGroup<T>>();

  for (const gasto of expenses) {
    // Una categoría borrada deja `categoryId` apuntando a nada; cae al cajón de
    // sastre en vez de crear un grupo con el rótulo vacío.
    const nombre = gasto.categoryId === null ? undefined : categoryName(gasto.categoryId);
    const clave = nombre === undefined ? "" : gasto.categoryId!;

    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = {
        categoryId: nombre === undefined ? null : gasto.categoryId,
        categoryName: nombre ?? SIN_CATEGORIA,
        expenses: [],
        monthlyEquivalent: 0,
      };
      grupos.set(clave, grupo);
    }

    grupo.expenses.push(gasto);
    if (gasto.isActive) grupo.monthlyEquivalent += monthlyEquivalent(gasto);
  }

  for (const grupo of grupos.values()) {
    grupo.expenses = sortFixedExpenses(grupo.expenses, sort);
  }

  return [...grupos.values()].sort((a, b) => {
    if (a.categoryId === null) return 1;
    if (b.categoryId === null) return -1;
    return b.monthlyEquivalent - a.monthlyEquivalent;
  });
}
