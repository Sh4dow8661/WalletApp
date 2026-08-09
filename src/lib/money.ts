import type { CurrencyCode } from "@/shared/constants.ts";

/**
 * Formateo de importes. Sustituye a `util/CurrencyFormatter.kt`.
 *
 * En Android era `NumberFormat.getCurrencyInstance(Locale.getDefault())` con la
 * moneda forzada; aquí es `Intl.NumberFormat`, que hace lo mismo: usa el formato
 * del idioma del usuario y el símbolo de la moneda indicada.
 */

/** Idioma por defecto de la app (§3.4). */
const LOCALE_POR_DEFECTO = "es-MX";

/**
 * Formatea un importe con su símbolo de moneda.
 *
 * Si el código de moneda no se reconoce cae a `CÓDIGO 1234.56`, igual que el
 * `catch` del original: más vale enseñar el número que romper la pantalla.
 */
export function formatMoney(
  amount: number,
  currency: CurrencyCode | string,
  locale: string = LOCALE_POR_DEFECTO,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Formatea con signo explícito: `-` en los gastos y `+` en los ingresos (§8.7).
 *
 * El signo va delante del valor absoluto, no lo pone el formateador. Se usa el
 * guion ASCII y no el menos tipográfico «−» para que coincida carácter a
 * carácter con lo que muestra la app Android (`CurrencyFormatter.formatSigned`).
 */
export function formatSignedMoney(
  amount: number,
  isExpense: boolean,
  currency: CurrencyCode | string,
  locale: string = LOCALE_POR_DEFECTO,
): string {
  return `${isExpense ? "-" : "+"}${formatMoney(Math.abs(amount), currency, locale)}`;
}

/**
 * Formatea sin símbolo de moneda, para campos de entrada y tablas densas.
 */
export function formatAmount(
  amount: number,
  locale: string = LOCALE_POR_DEFECTO,
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Convierte a número lo que el usuario teclea en un campo de importe.
 *
 * Acepta las dos convenciones porque el teclado del móvil y el del escritorio no
 * siempre coinciden: `1234.56` y `1.234,56` dan lo mismo. La heurística es la
 * del parser de recibos: el último separador es el decimal solo si lo siguen
 * una o dos cifras.
 *
 * Devuelve `null` si no hay nada aprovechable, para que el llamador distinga
 * «campo vacío» de «cero».
 */
export function parseAmountInput(input: string): number | null {
  const limpio = input.replace(/[^\d.,-]/g, "").trim();
  if (limpio === "" || !/\d/.test(limpio)) return null;

  const negativo = limpio.startsWith("-");
  const sinSigno = limpio.replace(/-/g, "");

  const ultimoSeparador = Math.max(sinSigno.lastIndexOf("."), sinSigno.lastIndexOf(","));
  let normalizado: string;

  if (ultimoSeparador === -1) {
    normalizado = sinSigno;
  } else {
    const decimales = sinSigno.length - ultimoSeparador - 1;
    if (decimales >= 1 && decimales <= 2) {
      const entera = sinSigno.slice(0, ultimoSeparador).replace(/[.,]/g, "");
      normalizado = `${entera === "" ? "0" : entera}.${sinSigno.slice(ultimoSeparador + 1)}`;
    } else {
      // El último separador es de miles: "1.234", "1,234,567".
      normalizado = sinSigno.replace(/[.,]/g, "");
    }
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) return null;
  return negativo ? -valor : valor;
}

/**
 * Redondea a céntimos.
 *
 * Los importes se guardan como REAL (coma flotante), así que sumar y restar
 * arrastra el error clásico: `0.1 + 0.2` no es `0.3`. Esto se aplica a los
 * totales que se muestran, no a lo que se guarda.
 */
export function roundToCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
