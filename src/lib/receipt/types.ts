/**
 * Tipos del parser de recibos. Portado de `domain/receipt/ParsedReceipt.kt`.
 *
 * Todo este módulo es lógica pura y **no está enchufado a nada todavía** (§3.3):
 * el escaneo con ML Kit no existe en web y queda fuera de la v1. Se porta con
 * sus tests porque es lógica valiosa y ya probada, lista para cuando se le
 * conecte un OCR (Tesseract.js o Workers AI) en una v2.
 */

/**
 * Pasa a MAYÚSCULAS, quita acentos y colapsa espacios, para comparar palabras
 * clave sin depender de cómo venga escrito el ticket.
 *
 * Equivale al `Normalizer.normalize(NFD)` + `\p{Mn}` de Kotlin: descompone cada
 * carácter acentuado en letra + tilde y borra las tildes.
 */
export function normalizeForMatching(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Confianza con la que se extrajo un campo. La UI resalta en ámbar lo dudoso
 * para que se revise antes de guardar.
 */
export type FieldConfidence = "HIGH" | "MEDIUM" | "LOW";

/**
 * Una línea reconocida en el recibo.
 *
 * `top` es la coordenada Y del rectángulo que la contiene, y sirve para ordenar
 * de arriba abajo. Es una abstracción propia justo para que el parser no dependa
 * del OCR concreto que la produjo.
 */
export interface ReceiptLine {
  text: string;
  top: number;
}

/** Resultado de parsear un recibo. Los campos nulos no se pudieron extraer. */
export interface ParsedReceipt {
  merchant: string | null;
  total: number | null;
  /** Fecha del ticket en epoch millis (medianoche local), o null. */
  date: number | null;
  /** Símbolo o código detectado junto al total: "$", "MXN", "€"… */
  currencyRaw: string | null;
  merchantConfidence: FieldConfidence;
  totalConfidence: FieldConfidence;
  dateConfidence: FieldConfidence;
}

/** Recibo vacío: ni tienda ni total. Foto borrosa o sin texto aprovechable. */
export function isEmptyReceipt(receipt: ParsedReceipt): boolean {
  return receipt.merchant === null && receipt.total === null;
}

export const RECIBO_VACIO: ParsedReceipt = {
  merchant: null,
  total: null,
  date: null,
  currencyRaw: null,
  merchantConfidence: "LOW",
  totalConfidence: "LOW",
  dateConfidence: "LOW",
};
