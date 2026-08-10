import type { TransactionType } from "@/shared/constants.ts";

import { csvDateTime } from "./dates.ts";
import { fromZonedTime } from "date-fns-tz";

/**
 * Exportación e importación en CSV. Sustituye a `util/CsvExporter.kt` y añade el
 * importador que pide §12.
 *
 * El formato es el que ya genera la app Android, para poder leer los archivos
 * que hay en el teléfono:
 *
 * ```
 * Date,Type,Amount,Category,Account,TransferAccount,Note
 * 2026-08-09 14:30:00,EXPENSE,25.5,Comida,Efectivo,,Almuerzo
 * ```
 *
 * ## Lo que el CSV no puede guardar
 *
 * Es importante tenerlo presente antes de usarlo como vía de migración: el CSV
 * **no** lleva presupuestos, ni los enlaces transacción↔presupuesto, ni los
 * balances iniciales, ni colores, ni iconos, ni `includeInTotal`. Y hay una
 * pérdida menos evidente, explicada en `pairTransfers`: **no guarda la dirección
 * de las transferencias**. Por eso §12 recomienda el export JSON completo desde
 * la app Android y deja el CSV como plan B.
 */

/** Cabecera exacta que escribe la app Android. No cambiarla. */
export const CSV_HEADER = "Date,Type,Amount,Category,Account,TransferAccount,Note";

export interface CsvRow {
  date: number;
  type: TransactionType;
  amount: number;
  categoryName: string;
  accountName: string;
  transferAccountName: string;
  note: string;
}

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------

export interface ExportableTransaction {
  date: number;
  type: TransactionType;
  amount: number;
  categoryName?: string | null;
  accountName?: string | null;
  transferAccountName?: string | null;
  note?: string | null;
}

/**
 * Genera el contenido del CSV.
 *
 * Igual que el original, las comas y los saltos de línea de la nota se cambian
 * por espacios en vez de entrecomillar el campo: así cada transacción ocupa
 * exactamente una línea y el archivo es trivial de leer con cualquier
 * herramienta.
 *
 * Única diferencia deliberada con Android: el importe sale con dos decimales
 * (`25.50`) en vez del `toString()` de Kotlin (`25.5`). Es dinero, y así se lee
 * mejor en una hoja de cálculo. El importador acepta las dos formas.
 */
export function toCsv(
  transactions: readonly ExportableTransaction[],
  timeZone: string,
): string {
  const lines = [CSV_HEADER];

  for (const tx of transactions) {
    lines.push(
      [
        csvDateTime(tx.date, timeZone),
        tx.type,
        tx.amount.toFixed(2),
        sanitizeField(tx.categoryName),
        sanitizeField(tx.accountName),
        sanitizeField(tx.transferAccountName),
        sanitizeField(tx.note),
      ].join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

/** Quita del campo lo que rompería el formato: comas y saltos de línea. */
function sanitizeField(value: string | null | undefined): string {
  return (value ?? "").replace(/[,\r\n]/g, " ").trim();
}

/** Nombre de archivo con el mismo patrón que la app Android. */
export function csvFileName(now: number = Date.now()): string {
  return `wallet_export_${now}.csv`;
}

// ---------------------------------------------------------------------------
// Importación
// ---------------------------------------------------------------------------

export interface CsvParseIssue {
  /** Número de línea en el archivo, contando la cabecera como la 1. */
  line: number;
  message: string;
  raw: string;
}

export interface CsvParseResult {
  rows: CsvRow[];
  issues: CsvParseIssue[];
}

/**
 * Lee un CSV con el formato de la app Android.
 *
 * Es tolerante a propósito: se salta líneas vacías, admite CRLF, acepta campos
 * entrecomillados (aunque el exportador no los genere) y recoge cada línea mala
 * en `issues` en vez de abortar. Un archivo con una línea corrupta no debe
 * costar la importación entera.
 */
/**
 * Marca de orden de bytes. Se construye por codepoint a propósito: escribirla
 * literal deja un carácter invisible en el fuente que el linter marca y que
 * cualquier edición posterior puede romper sin que se note.
 */
const BOM = String.fromCharCode(0xfeff);

/** Quita el BOM inicial si lo hay. */
function stripBom(line: string): string {
  return line.startsWith(BOM) ? line.slice(1) : line;
}

export function parseCsv(content: string, timeZone: string): CsvParseResult {
  const rows: CsvRow[] = [];
  const issues: CsvParseIssue[] = [];

  const lines = content.split(/\r?\n/);
  let startIndex = 0;

  // La cabecera es opcional: si falta, se asume el orden de columnas conocido.
  // U+FEFF es el BOM que anteponen Excel y algunos editores al guardar en UTF-8;
  // sin quitarlo, la cabecera no casaría y se leería como si fuera una fila.
  if (
    stripBom(lines[0] ?? "")
      .trim()
      .toLowerCase() === CSV_HEADER.toLowerCase()
  ) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === "") continue;

    const fields = splitCsvLine(raw);
    if (fields.length < 5) {
      issues.push({
        line: i + 1,
        message: "La línea no tiene columnas suficientes",
        raw,
      });
      continue;
    }

    const [fecha, tipo, importe, categoria, cuenta, cuentaDestino, nota] = fields;

    const date = parseCsvDate(fecha!.trim(), timeZone);
    if (date === null) {
      issues.push({ line: i + 1, message: `Fecha ilegible: "${fecha}"`, raw });
      continue;
    }

    const type = tipo!.trim().toUpperCase();
    if (type !== "INCOME" && type !== "EXPENSE" && type !== "TRANSFER") {
      issues.push({ line: i + 1, message: `Tipo desconocido: "${tipo}"`, raw });
      continue;
    }

    const amount = Number(importe!.trim().replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      issues.push({ line: i + 1, message: `Importe inválido: "${importe}"`, raw });
      continue;
    }

    rows.push({
      date,
      type,
      amount,
      categoryName: (categoria ?? "").trim(),
      accountName: (cuenta ?? "").trim(),
      transferAccountName: (cuentaDestino ?? "").trim(),
      note: (nota ?? "").trim(),
    });
  }

  return { rows, issues };
}

/** Separa una línea de CSV respetando los campos entrecomillados. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let actual = "";
  let dentroDeComillas = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (dentroDeComillas) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          dentroDeComillas = false;
        }
      } else {
        actual += ch;
      }
    } else if (ch === '"') {
      dentroDeComillas = true;
    } else if (ch === ",") {
      fields.push(actual);
      actual = "";
    } else {
      actual += ch;
    }
  }
  fields.push(actual);

  return fields;
}

/**
 * Convierte `yyyy-MM-dd HH:mm:ss` a epoch millis **en la zona del usuario**.
 *
 * El CSV no lleva desfase horario, así que la única lectura correcta es
 * interpretarlo como hora local: leerlo como UTC correría todas las fechas.
 */
function parseCsvDate(value: string, timeZone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value.trim(),
  );
  if (!m) return null;

  const [, y, mo, d, h, mi, s] = m;
  const millis = fromZonedTime(
    `${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}.000`,
    timeZone,
  ).getTime();
  return Number.isFinite(millis) ? millis : null;
}

// ---------------------------------------------------------------------------
// Reconstrucción de transferencias
// ---------------------------------------------------------------------------

export interface TransferPair {
  /** Fila que sale de la cuenta (`isOutgoing = true`). */
  outgoing: CsvRow;
  /** Fila que entra en la otra cuenta. */
  incoming: CsvRow;
}

export interface TransferPairingResult {
  pairs: TransferPair[];
  /**
   * Filas de tipo TRANSFER que no encontraron pareja. Casi siempre son víctimas
   * del bug de §8.2: la app Android descuadraba las patas al editar o borrar, y
   * con importes o fechas distintos ya no casan.
   */
  orphans: CsvRow[];
}

/**
 * Empareja las dos patas de cada transferencia (§12).
 *
 * Se buscan filas con **misma fecha, mismo importe y cuentas cruzadas**: una con
 * `Account=A, TransferAccount=B` y otra con `Account=B, TransferAccount=A`.
 *
 * ## Una limitación que hay que conocer
 *
 * **El CSV no guarda `isOutgoing`**, así que ante un par (A→B) y (B→A) no hay
 * forma de saber cuál era la saliente. Y no da igual: elegir mal invierte la
 * dirección del dinero y deja los dos saldos cambiados entre sí.
 *
 * La convención aquí es determinista: **la que aparece antes en el archivo se
 * toma como saliente**. Es una suposición, no un dato, y por eso el importador
 * tiene que avisar de cuántas transferencias reconstruyó para que se revisen.
 * Es una razón de peso más para preferir el export JSON de §12.
 */
export function pairTransfers(rows: readonly CsvRow[]): TransferPairingResult {
  const transfers = rows.filter((r) => r.type === "TRANSFER");
  const pairs: TransferPair[] = [];
  const orphans: CsvRow[] = [];
  const emparejadas = new Set<number>();

  transfers.forEach((row, index) => {
    if (emparejadas.has(index)) return;

    const parejaIndex = transfers.findIndex(
      (candidata, j) =>
        j > index &&
        !emparejadas.has(j) &&
        candidata.date === row.date &&
        candidata.amount === row.amount &&
        candidata.accountName === row.transferAccountName &&
        candidata.transferAccountName === row.accountName,
    );

    if (parejaIndex === -1) {
      orphans.push(row);
      return;
    }

    emparejadas.add(index);
    emparejadas.add(parejaIndex);
    // La primera del archivo se asume saliente; ver la nota de arriba.
    pairs.push({ outgoing: row, incoming: transfers[parejaIndex]! });
  });

  return { pairs, orphans };
}

/** Nombres únicos de cuenta que aparecen en el archivo. */
export function accountNamesIn(rows: readonly CsvRow[]): string[] {
  const nombres = new Set<string>();
  for (const row of rows) {
    if (row.accountName !== "") nombres.add(row.accountName);
    if (row.transferAccountName !== "") nombres.add(row.transferAccountName);
  }
  return [...nombres];
}

/** Nombres únicos de categoría, con el tipo que les corresponde. */
export function categoryNamesIn(
  rows: readonly CsvRow[],
): { name: string; type: "INCOME" | "EXPENSE" }[] {
  const porNombre = new Map<string, "INCOME" | "EXPENSE">();
  for (const row of rows) {
    // Las transferencias no llevan categoría.
    if (row.type === "TRANSFER" || row.categoryName === "") continue;
    if (!porNombre.has(row.categoryName)) {
      porNombre.set(row.categoryName, row.type === "INCOME" ? "INCOME" : "EXPENSE");
    }
  }
  return [...porNombre.entries()].map(([name, type]) => ({ name, type }));
}
