import { isValidId } from "@/lib/id.ts";
import {
  ACCOUNT_TYPES,
  BUDGET_RECURRENCES,
  CATEGORY_TYPES,
  ICON_NAMES,
  SUPPORTED_CURRENCIES,
  THEME_MODES,
  TRANSACTION_TYPES,
} from "@/shared/constants.ts";

/**
 * Validación de las entradas del API.
 *
 * Todo lo que llega del cliente pasa por aquí antes de tocar la base. Es a
 * propósito estricto: los IDs los genera el cliente (por la cola offline), así
 * que no se puede dar por bueno nada de lo que manda.
 */

/** Elementos máximos en una lista de identificadores. Ver `idArray`. */
const MAX_IDS = 50;

export class ValidationError extends Error {
  // Campos declarados aparte y no como parámetros del constructor: los
  // "parameter properties" de TypeScript emiten código, y el tsconfig usa
  // `erasableSyntaxOnly` para que todo el TS se pueda borrar sin transformar.
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Datos inválidos");
    this.name = "ValidationError";
    this.fields = fields;
  }
}

/** Acumula errores por campo para poder devolverlos todos de una vez. */
export class Validator {
  private readonly errors: Record<string, string> = {};
  private readonly body: Record<string, unknown>;

  constructor(body: Record<string, unknown>) {
    this.body = body;
  }

  /** Texto no vacío, con longitud máxima. */
  requiredString(field: string, maxLength = 200): string {
    const v = this.body[field];
    if (typeof v !== "string" || v.trim() === "") {
      this.errors[field] = "Requerido";
      return "";
    }
    const trimmed = v.trim();
    if (trimmed.length > maxLength) {
      this.errors[field] = `Máximo ${maxLength} caracteres`;
      return trimmed.slice(0, maxLength);
    }
    return trimmed;
  }

  optionalString(field: string, maxLength = 500): string {
    const v = this.body[field];
    if (v === undefined || v === null) return "";
    if (typeof v !== "string") {
      this.errors[field] = "Debe ser texto";
      return "";
    }
    if (v.length > maxLength) {
      this.errors[field] = `Máximo ${maxLength} caracteres`;
      return v.slice(0, maxLength);
    }
    return v;
  }

  /** Número finito. Sin NaN ni Infinity: SQLite los guardaría como NULL o basura. */
  number(field: string, { min, max }: { min?: number; max?: number } = {}): number {
    const v = this.body[field];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      this.errors[field] = "Debe ser un número";
      return 0;
    }
    if (min !== undefined && v < min) {
      this.errors[field] = `Debe ser al menos ${min}`;
      return v;
    }
    if (max !== undefined && v > max) {
      this.errors[field] = `Debe ser como mucho ${max}`;
      return v;
    }
    return v;
  }

  /**
   * Número opcional que además admite `null` explícito.
   *
   * Distingue tres casos que no son lo mismo: ausente y `null` significan «sin
   * valor» y devuelven `null`; cualquier otra cosa se valida como número. Lo
   * usan los campos que se pueden dejar sin configurar, como el límite de
   * crédito de una tarjeta.
   */
  nullableNumber(
    field: string,
    { min, max }: { min?: number; max?: number } = {},
  ): number | null {
    const v = this.body[field];
    if (v === undefined || v === null) return null;
    return this.number(field, { min, max });
  }

  /** Importe estrictamente positivo, como valida `AddEditTransactionViewModel`. */
  positiveAmount(field: string): number {
    const v = this.number(field);
    if (this.errors[field]) return 0;
    if (v <= 0) {
      this.errors[field] = "El monto debe ser mayor que cero";
      return 0;
    }
    return v;
  }

  /** Epoch millis dentro de un rango sensato. */
  timestamp(field: string): number {
    const v = this.number(field);
    if (this.errors[field]) return 0;
    if (!Number.isInteger(v) || v < 0 || v > 4_102_444_800_000) {
      this.errors[field] = "Fecha fuera de rango";
      return 0;
    }
    return v;
  }

  boolean(field: string, fallback = false): boolean {
    const v = this.body[field];
    if (v === undefined || v === null) return fallback;
    if (typeof v !== "boolean") {
      this.errors[field] = "Debe ser booleano";
      return fallback;
    }
    return v;
  }

  /** Valor de una lista cerrada. Respalda los CHECK del esquema. */
  enum<T extends string>(field: string, allowed: readonly T[]): T {
    const v = this.body[field];
    if (typeof v !== "string" || !allowed.includes(v as T)) {
      this.errors[field] = `Debe ser uno de: ${allowed.join(", ")}`;
      return allowed[0]!;
    }
    return v as T;
  }

  /** Color `#RRGGBB`. Se normaliza a mayúsculas para que el CSV case. */
  colorHex(field: string): string {
    const v = this.body[field];
    if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) {
      this.errors[field] = "Debe ser un color #RRGGBB";
      return "#78909C";
    }
    return v.toUpperCase();
  }

  /** ID generado por el cliente. Si no viene, lo genera el servidor. */
  optionalId(field: string): string | undefined {
    const v = this.body[field];
    if (v === undefined || v === null) return undefined;
    if (!isValidId(v)) {
      this.errors[field] = "Identificador inválido";
      return undefined;
    }
    return v;
  }

  /** Referencia opcional a otra fila. */
  nullableRef(field: string): string | null {
    const v = this.body[field];
    if (v === undefined || v === null || v === "") return null;
    if (!isValidId(v)) {
      this.errors[field] = "Identificador inválido";
      return null;
    }
    return v;
  }

  requiredRef(field: string): string {
    const v = this.body[field];
    if (!isValidId(v)) {
      this.errors[field] = "Identificador requerido";
      return "";
    }
    return v;
  }

  /**
   * Lista de IDs, deduplicada y con techo.
   *
   * El techo no es un capricho: la lista acaba en un `IN (...)` y D1 solo admite
   * 100 variables por sentencia. Además, ninguna pantalla tiene sentido con 50
   * presupuestos enlazados a un mismo movimiento.
   */
  idArray(field: string): string[] {
    const v = this.body[field];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      this.errors[field] = "Debe ser una lista";
      return [];
    }
    if (v.some((item) => !isValidId(item))) {
      this.errors[field] = "Contiene identificadores inválidos";
      return [];
    }

    const unicos = [...new Set(v as string[])];
    if (unicos.length > MAX_IDS) {
      this.errors[field] = `No se admiten más de ${MAX_IDS} elementos`;
      return [];
    }
    return unicos;
  }

  /** Zona IANA. Se valida contra el propio runtime, no contra una lista fija. */
  timeZone(field: string): string {
    const v = this.body[field];
    if (typeof v !== "string") {
      this.errors[field] = "Debe ser texto";
      return "UTC";
    }
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return v;
    } catch {
      this.errors[field] = "Zona horaria desconocida";
      return "UTC";
    }
  }

  /** Marca un error que no viene de un campo suelto (reglas cruzadas). */
  reject(field: string, message: string): void {
    this.errors[field] = message;
  }

  has(field: string): boolean {
    return this.body[field] !== undefined;
  }

  /** Lanza si hubo algún error. Se llama al final de cada handler. */
  throwIfInvalid(): void {
    if (Object.keys(this.errors).length > 0) throw new ValidationError(this.errors);
  }
}

// Atajos para los enums más usados, que así quedan atados a las constantes.
export const accountTypeOf = (v: Validator) => v.enum("type", ACCOUNT_TYPES);
export const categoryTypeOf = (v: Validator) => v.enum("type", CATEGORY_TYPES);
export const transactionTypeOf = (v: Validator) => v.enum("type", TRANSACTION_TYPES);
export const recurrenceOf = (v: Validator) => v.enum("recurrence", BUDGET_RECURRENCES);
export const iconNameOf = (v: Validator) => v.enum("iconName", ICON_NAMES);
export const currencyOf = (v: Validator) => v.enum("currency", SUPPORTED_CURRENCIES);
export const themeModeOf = (v: Validator) => v.enum("themeMode", THEME_MODES);
