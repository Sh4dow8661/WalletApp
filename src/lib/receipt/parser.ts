import { DEFAULT_TIME_ZONE } from "@/shared/constants.ts";

import { zonedTime } from "../dates.ts";
import {
  type FieldConfidence,
  type ParsedReceipt,
  RECIBO_VACIO,
  type ReceiptLine,
  normalizeForMatching,
} from "./types.ts";

/**
 * Extrae TIENDA, TOTAL y FECHA del texto de un recibo. Portado de
 * `domain/receipt/ReceiptParser.kt`, con la misma heurística línea a línea.
 *
 * Reglas, en resumen:
 * - **TOTAL**: líneas con TOTAL / TOTAL A PAGAR / IMPORTE / MONTO; se ignoran
 *   SUBTOTAL, IVA, CAMBIO, EFECTIVO, PROPINA… Toma el importe del mismo renglón
 *   o del más cercano por debajo. Con varios candidatos gana el mayor y, a
 *   igualdad, el que esté más abajo. Entiende `1,234.56` y `1.234,56`.
 * - **TIENDA**: primeras líneas de arriba, descartando dirección, RFC, teléfono,
 *   web o encabezados tipo "TICKET"/"FACTURA".
 * - **FECHA**: dd/MM/yyyy, dd-MM-yy, yyyy-MM-dd… Si no hay, null.
 *
 * Única diferencia con el original: la zona horaria entra por parámetro. En
 * Kotlin se usaba la del dispositivo; aquí no existe tal cosa (el Worker corre
 * en UTC), así que la fecha del ticket se construye en la zona del usuario.
 */

/** Palabras que marcan el total a pagar. */
const TOTAL_KEYWORDS = [
  "TOTAL A PAGAR",
  "IMPORTE TOTAL",
  "GRAN TOTAL",
  "TOTAL VENTA",
  "TOTAL COMPRA",
  "A PAGAR",
  "TOTAL",
  "IMPORTE",
  "MONTO",
];

/**
 * Si la línea contiene alguna de estas, no es el total aunque diga "TOTAL"
 * (SUBTOTAL) o lleve un importe (IVA, CAMBIO, EFECTIVO…).
 */
const TOTAL_NEGATIVE_KEYWORDS = [
  "SUBTOTAL",
  "SUB TOTAL",
  "SUB-TOTAL",
  "IVA",
  "I.V.A",
  "IEPS",
  "IMPUESTO",
  "CAMBIO",
  "SU CAMBIO",
  "CHANGE",
  "EFECTIVO",
  "CASH",
  "TARJETA",
  "PAGO",
  "RECIBIDO",
  "PAGADO",
  "PROPINA",
  "TIP",
  "DESCUENTO",
  "AHORRO",
  "AHORRASTE",
  "PUNTOS",
  "REDONDEO",
  "ARTICULOS",
  "ARTICULO",
  "ITEMS",
  "PIEZAS",
  "PZAS",
  "CANTIDAD",
  "UNIDADES",
  "PRODUCTOS",
];

/** Encabezados y pies que nunca son el nombre de la tienda. */
const MERCHANT_NOISE_KEYWORDS = [
  "TICKET",
  "FACTURA",
  "NOTA DE VENTA",
  "NOTA DE COMPRA",
  "COMPROBANTE",
  "RECIBO",
  "ORDEN",
  "FOLIO",
  "CAJA",
  "CAJERO",
  "SUCURSAL",
  "MESA",
  "RFC",
  "REGIMEN",
  "TEL",
  "TELEFONO",
  "FECHA",
  "HORA",
  "CLIENTE",
  "GRACIAS",
  "VUELVA",
  "BIENVENIDO",
  "WWW",
  "HTTP",
  ".COM",
  "@",
  "CALLE",
  "AVENIDA",
  "AV.",
  "AV ",
  "BLVD",
  "COL.",
  "COLONIA",
  "C.P.",
  "CP ",
  "CARRETERA",
  "KM ",
  "No.",
  "NUM.",
  "DELEG",
  "MUNICIPIO",
];

/** Secuencia numérica con separadores: 1,234.56 · 1.234,56 · 100 · 3.50 */
const AMOUNT_TOKEN = /\d[\d.,]*\d|\d/g;
/** RFC mexicano. */
const RFC_REGEX = /[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/;
/** 7 o más dígitos seguidos parecen teléfono o folio, no una tienda. */
const LONG_DIGITS = /\d{7,}/;
const DATE_ISO = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
const DATE_DMY = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/;

export function parseReceipt(
  lines: readonly ReceiptLine[],
  timeZone: string = DEFAULT_TIME_ZONE,
): ParsedReceipt {
  const clean = lines
    .map((l) => ({ ...l, text: l.text.trim() }))
    .filter((l) => l.text !== "")
    // El OCR ya suele venir ordenado; esto lo refuerza. `sort` en JS es estable,
    // así que a igual `top` se mantiene el orden de lectura.
    .sort((a, b) => a.top - b.top);

  if (clean.length === 0) return { ...RECIBO_VACIO };

  const { total, confidence: totalConfidence, currency } = extractTotal(clean);
  const { merchant, confidence: merchantConfidence } = extractMerchant(clean);
  const { date, confidence: dateConfidence } = extractDate(clean, timeZone);

  return {
    merchant,
    total,
    date,
    currencyRaw: currency,
    merchantConfidence,
    totalConfidence,
    dateConfidence,
  };
}

// --- TOTAL -----------------------------------------------------------------

interface TotalCandidate {
  amount: number;
  index: number;
  /** El importe estaba en la misma línea que la palabra clave. */
  sameLine: boolean;
  currency: string | null;
}

function extractTotal(lines: readonly ReceiptLine[]): {
  total: number | null;
  confidence: FieldConfidence;
  currency: string | null;
} {
  const candidates: TotalCandidate[] = [];

  lines.forEach((line, index) => {
    const norm = normalizeForMatching(line.text);
    const isNegative = TOTAL_NEGATIVE_KEYWORDS.some((k) => norm.includes(k));
    const isTotal = TOTAL_KEYWORDS.some((k) => norm.includes(k));
    if (!isTotal || isNegative) return;

    const sameLineAmounts = findAmounts(line.text);
    if (sameLineAmounts.length > 0) {
      candidates.push({
        amount: Math.max(...sameLineAmounts),
        index,
        sameLine: true,
        currency: detectCurrency(line.text),
      });
      return;
    }

    // El importe puede estar en uno de los dos renglones siguientes.
    for (let next = index + 1; next <= Math.min(index + 2, lines.length - 1); next++) {
      const amounts = findAmounts(lines[next]!.text);
      if (amounts.length > 0) {
        candidates.push({
          amount: Math.max(...amounts),
          index: next,
          sameLine: false,
          currency: detectCurrency(lines[next]!.text),
        });
        break;
      }
    }
  });

  if (candidates.length > 0) {
    // Gana el importe mayor; a igualdad, el que esté más abajo.
    const best = candidates.reduce((mejor, c) =>
      c.amount > mejor.amount || (c.amount === mejor.amount && c.index > mejor.index)
        ? c
        : mejor,
    );
    return {
      total: best.amount,
      confidence: best.sameLine ? "HIGH" : "MEDIUM",
      currency: best.currency,
    };
  }

  // Sin palabra clave: el total suele ser el importe con separador más grande.
  const moneyAmounts = lines.flatMap((l) => findAmounts(l.text, true));
  const currency =
    lines.map((l) => detectCurrency(l.text)).find((c) => c !== null) ?? null;
  return {
    total: moneyAmounts.length > 0 ? Math.max(...moneyAmounts) : null,
    confidence: "LOW",
    currency,
  };
}

/**
 * Importes positivos de una línea. Con `requireSeparator` solo cuentan los que
 * llevan `.` o `,`, para descartar cantidades, teléfonos y folios cuando se
 * busca el total por descarte.
 */
function findAmounts(text: string, requireSeparator = false): number[] {
  const tokens = text.match(AMOUNT_TOKEN) ?? [];
  return tokens
    .filter((t) => !requireSeparator || t.includes(".") || t.includes(","))
    .map(normalizeAmount)
    .filter((n): n is number => n !== null && n > 0);
}

/**
 * Convierte un token numérico a número, aceptando el formato US (`1,234.56`) y
 * el europeo/LATAM (`1.234,56`).
 *
 * Heurística: el último separador es el decimal solo si lo siguen una o dos
 * cifras; si no, es separador de miles.
 */
export function normalizeAmount(token: string): number | null {
  const s = [...token].filter((ch) => /[\d.,]/.test(ch)).join("");
  if (!/\d/.test(s)) return null;

  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (lastSep === -1) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const decimalsAfter = s.length - lastSep - 1;
  let normalizado: string;
  if (decimalsAfter >= 1 && decimalsAfter <= 2) {
    const intPart = s.slice(0, lastSep).replace(/[.,]/g, "");
    normalizado = `${intPart === "" ? "0" : intPart}.${s.slice(lastSep + 1)}`;
  } else {
    normalizado = s.replace(/[.,]/g, "");
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function detectCurrency(text: string): string | null {
  const upper = text.toUpperCase();
  if (text.includes("€")) return "€";
  if (upper.includes("MXN")) return "MXN";
  if (upper.includes("USD")) return "USD";
  if (upper.includes("EUR")) return "EUR";
  if (text.includes("$")) return "$";
  return null;
}

// --- TIENDA ----------------------------------------------------------------

function extractMerchant(lines: readonly ReceiptLine[]): {
  merchant: string | null;
  confidence: FieldConfidence;
} {
  const top = lines.slice(0, 6);

  for (const [index, line] of top.entries()) {
    if (!isMerchantNoise(line.text)) {
      return {
        merchant: line.text.replace(/\s+/g, " ").trim(),
        // La primera línea es lo más habitual; más abajo, menos seguro.
        confidence: index === 0 ? "HIGH" : "MEDIUM",
      };
    }
  }

  // Último recurso: la primera línea, aunque parezca ruido.
  return { merchant: top[0]?.text.trim() ?? null, confidence: "LOW" };
}

function isMerchantNoise(text: string): boolean {
  const norm = normalizeForMatching(text);
  if (norm.length < 2) return true;
  if (RFC_REGEX.test(text.toUpperCase())) return true;
  if (LONG_DIGITS.test(text)) return true;
  if (MERCHANT_NOISE_KEYWORDS.some((k) => norm.includes(k))) return true;

  // Mayoría de dígitos o símbolos: direcciones, importes, fechas sueltas.
  const letters = [...norm].filter((ch) => /\p{L}/u.test(ch)).length;
  const digits = [...norm].filter((ch) => /\d/.test(ch)).length;
  return letters < 2 || digits > letters;
}

// --- FECHA -----------------------------------------------------------------

function extractDate(
  lines: readonly ReceiptLine[],
  timeZone: string,
): { date: number | null; confidence: FieldConfidence } {
  const text = lines.map((l) => l.text).join("\n");

  const iso = DATE_ISO.exec(text);
  if (iso) {
    const fecha = buildDate(Number(iso[3]), Number(iso[2]), Number(iso[1]), timeZone);
    if (fecha !== null) return { date: fecha, confidence: "HIGH" };
  }

  const dmy = DATE_DMY.exec(text);
  if (dmy) {
    let day = Number(dmy[1]);
    let month = Number(dmy[2]);
    // Formato LATAM dd/MM. Si el mes no es válido, se prueba MM/dd (US).
    if (month > 12 && day <= 12) [day, month] = [month, day];

    const rawYear = dmy[3]!;
    const fecha = buildDate(day, month, expandYear(rawYear), timeZone);
    if (fecha !== null) {
      return { date: fecha, confidence: rawYear.length === 4 ? "HIGH" : "MEDIUM" };
    }
  }

  return { date: null, confidence: "LOW" };
}

function expandYear(raw: string): number {
  const n = Number(raw);
  return raw.length === 2 ? 2000 + n : n;
}

function buildDate(
  day: number,
  month: number,
  year: number,
  timeZone: string,
): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1970 || year > 2100) {
    return null;
  }
  // Un 31 en un mes de 30 días quedaría recortado por `zonedTime`, así que se
  // rechaza antes: una fecha imposible en el ticket es un fallo del OCR, y es
  // mejor devolver null (el llamador usa la fecha actual) que inventar un día.
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;

  return zonedTime({ year, month, day }, timeZone);
}
