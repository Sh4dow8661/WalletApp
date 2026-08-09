import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Fechas, siempre con zona horaria explícita.
 *
 * Sustituye a `util/DateUtils.kt`. La regla que gobierna este archivo:
 * **ninguna función usa la zona horaria de la máquina**. En Workers eso sería
 * UTC, y agrupar por día en UTC es exactamente el bug del heatmap de §8.6: en
 * UTC−4, todo gasto anterior a las 20:00 locales cae en el día anterior.
 * Por eso la zona entra por parámetro y sale de `user_settings.time_zone`.
 *
 * Los instantes se guardan como epoch millis, igual que en Room.
 */

/** Milisegundos de un día. Solo para duraciones, nunca para agrupar por día. */
export const MS_PER_DAY = 86_400_000;

/**
 * Clave de día local, `yyyy-MM-dd`.
 *
 * Es la sustituta correcta del `(date / 86400000) * 86400000` de
 * `TransactionDao.observeDailyExpenseInRange`, que agrupaba por día UTC.
 */
export function dayKey(millis: number, timeZone: string): string {
  return formatInTimeZone(millis, timeZone, "yyyy-MM-dd");
}

/** Instante de la medianoche local del día que contiene `millis`. */
export function startOfDay(millis: number, timeZone: string): number {
  return fromZonedTime(`${dayKey(millis, timeZone)}T00:00:00.000`, timeZone).getTime();
}

/** Último instante del día local que contiene `millis` (…23:59:59.999). */
export function endOfDay(millis: number, timeZone: string): number {
  return fromZonedTime(`${dayKey(millis, timeZone)}T23:59:59.999`, timeZone).getTime();
}

/**
 * Convierte el `YYYY-MM-DD` de un `<input type="date">` a la medianoche LOCAL.
 *
 * Es el equivalente web de `DateUtils.pickerMillisToLocalStartOfDay`, y el
 * motivo por el que existe es el mismo que motivó el commit 36b465d en Android.
 * `new Date("2026-08-09")` interpreta la cadena como UTC y corre la fecha un día.
 */
export function dateInputToMillis(input: string, timeZone: string): number {
  return fromZonedTime(`${input}T00:00:00.000`, timeZone).getTime();
}

/** Formatea un instante como `YYYY-MM-DD` para un `<input type="date">`. */
export function millisToDateInput(millis: number, timeZone: string): string {
  return dayKey(millis, timeZone);
}

/** Año y mes (1-12) locales del instante dado. */
export function yearMonth(
  millis: number,
  timeZone: string,
): { year: number; month: number } {
  const [year, month] = formatInTimeZone(millis, timeZone, "yyyy-MM").split("-");
  return { year: Number(year), month: Number(month) };
}

/**
 * Rango [inicio, fin] de un mes en hora local, en epoch millis.
 * `fin` es el último milisegundo del mes, como el `monthRange` de Android.
 */
export function monthRange(
  year: number,
  month: number,
  timeZone: string,
): { from: number; to: number } {
  const mm = String(month).padStart(2, "0");
  const from = fromZonedTime(`${year}-${mm}-01T00:00:00.000`, timeZone).getTime();

  // El fin es un milisegundo antes del inicio del mes siguiente. Calcularlo así
  // (y no con "el día 28/30/31") evita tener que saber cuántos días tiene el mes.
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const nextMm = String(next.m).padStart(2, "0");
  const to = fromZonedTime(`${next.y}-${nextMm}-01T00:00:00.000`, timeZone).getTime() - 1;

  return { from, to };
}

/**
 * Suma (o resta) meses a un par año/mes. Equivale a `DateUtils.addMonths`.
 *
 * Es aritmética pura sobre el contador de meses, a propósito: aquí no hay ningún
 * instante real, solo una coordenada de calendario. Hacerlo con un `Date`
 * intermedio es una trampa — `addMonths` de date-fns opera en la hora local del
 * proceso, así que combinado con `Date.UTC` devuelve el mes equivocado en
 * cualquier zona al oeste de Greenwich.
 */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const totalMonths = year * 12 + (month - 1) + delta;
  const y = Math.floor(totalMonths / 12);
  // Con Math.floor el resto queda siempre en 0..11, también con años negativos.
  return { year: y, month: totalMonths - y * 12 + 1 };
}

/** Días del mes indicado. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Día de la semana del día 1 del mes, con lunes = 0 y domingo = 6.
 * Réplica de `DateUtils.firstDayOfWeekOfMonth`, que es lo que espera la
 * cuadrícula del calendario.
 */
export function firstWeekdayOfMonth(year: number, month: number): number {
  const jsDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // domingo = 0
  return (jsDay + 6) % 7;
}

/** Día del mes (1-31) en hora local. */
export function dayOfMonth(millis: number, timeZone: string): number {
  return Number(formatInTimeZone(millis, timeZone, "d"));
}

/**
 * Partes de fecha/hora locales de un instante. Se usa para calcular períodos de
 * presupuesto sin depender de la zona de la máquina.
 */
export function zonedParts(
  millis: number,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
} {
  const s = formatInTimeZone(millis, timeZone, "yyyy-MM-dd-HH-mm-ss-SSS");
  const [year, month, day, hour, minute, second, ms] = s.split("-").map(Number);
  return {
    year: year!,
    month: month!,
    day: day!,
    hour: hour!,
    minute: minute!,
    second: second!,
    ms: ms!,
  };
}

/**
 * Construye un instante a partir de partes locales, recortando el día al último
 * disponible del mes. Con `day = 31` en febrero devuelve el 28 (o el 29).
 *
 * Este recorte es justo lo que necesitan los presupuestos mensuales anclados a
 * fin de mes (§8.5).
 */
export function zonedTime(
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
    ms?: number;
  },
  timeZone: string,
): number {
  const { year, month, hour = 0, minute = 0, second = 0, ms = 0 } = parts;
  const day = Math.min(parts.day, daysInMonth(year, month));
  const iso =
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` +
    `T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}` +
    `.${String(ms).padStart(3, "0")}`;
  return fromZonedTime(iso, timeZone).getTime();
}

/**
 * Días completos entre dos instantes, contando por **días locales** y no por
 * bloques de 86 400 000 ms. La diferencia importa cuando hay cambio de horario
 * de verano: un día puede durar 23 o 25 horas.
 */
export function daysBetween(
  fromMillis: number,
  toMillis: number,
  timeZone: string,
): number {
  const a = toZonedTime(startOfDay(fromMillis, timeZone), timeZone);
  const b = toZonedTime(startOfDay(toMillis, timeZone), timeZone);
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Etiqueta corta de mes en español, como las del gráfico de 6 meses. */
export function shortMonthLabel(year: number, month: number, locale = "es"): string {
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(".", "");
}

/**
 * Etiqueta "Agosto 2026" para las cabeceras de mes.
 *
 * Se compone a mano en vez de pedirle a `Intl` mes y año juntos: en español eso
 * devuelve "agosto de 2026", con un "de" que la app Android no tenía
 * (`SimpleDateFormat("MMMM yyyy")` + inicial en mayúscula).
 */
export function monthLabel(year: number, month: number, locale = "es"): string {
  const nombre = new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${year}`;
}

/** Fecha y hora en `yyyy-MM-dd HH:mm:ss`, el formato exacto del CSV (§8.7). */
export function csvDateTime(millis: number, timeZone: string): string {
  return formatInTimeZone(millis, timeZone, "yyyy-MM-dd HH:mm:ss");
}
