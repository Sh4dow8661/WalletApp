/**
 * Generación de identificadores.
 *
 * El esquema de D1 usa IDs de texto en vez del INTEGER AUTOINCREMENT de Room.
 * El motivo es el modo offline: el cliente tiene que poder crear una fila y
 * encolarla sin haber hablado con el servidor, y sin arriesgarse a chocar con
 * un ID que el servidor asignara mientras tanto.
 *
 * Se usa UUID v7 y no v4 porque los primeros 48 bits son el timestamp en
 * milisegundos, así que el ID es ordenable por tiempo. Eso importa en SQLite:
 * un índice sobre una clave primaria aleatoria se fragmenta al insertar, y
 * `ORDER BY id` sirve como desempate estable de `ORDER BY date`.
 */

/**
 * Genera un UUID versión 7 (RFC 9562).
 *
 * Formato: 48 bits de timestamp en ms | versión (4 bits) | 12 bits aleatorios |
 * variante (2 bits) | 62 bits aleatorios.
 *
 * @param now Timestamp en epoch millis. Inyectable para poder testearlo.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Timestamp de 48 bits, big-endian, en los bytes 0..5.
  // Se usa aritmética de punto flotante en la parte alta porque el timestamp en
  // ms cabe de sobra en un double, y así se evita BigInt.
  const ms = Math.floor(now);
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  // Versión 7 en los 4 bits altos del byte 6.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // Variante RFC 4122 (10xx) en los 2 bits altos del byte 8.
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Formato canónico de un UUID, en minúsculas. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Comprueba que una cadena es un UUID con forma válida.
 *
 * El servidor acepta IDs generados por el cliente (así funciona la cola offline),
 * así que hay que validarlos antes de que lleguen a la base: sin esto, el cliente
 * podría escoger el ID de una fila de otro usuario y provocar una colisión de
 * clave primaria. Acepta cualquier versión, no solo la 7, para no romper si en el
 * futuro entran IDs de otra procedencia.
 */
export function isValidId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Extrae el timestamp de un UUID v7. Devuelve null si no es un v7 válido. */
export function timestampFromUuidv7(id: string): number | null {
  if (!isValidId(id)) return null;
  const hex = id.replace(/-/g, "");
  // El nibble de versión es el dígito 12 del hex.
  if (hex[12] !== "7") return null;
  return Number.parseInt(hex.slice(0, 12), 16);
}
