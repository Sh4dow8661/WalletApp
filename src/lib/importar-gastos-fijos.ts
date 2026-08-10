import { CATEGORY_PALETTE, FALLBACK_ICON } from "@/shared/constants.ts";
import type { IconName } from "@/shared/constants.ts";

import { parseAmountInput } from "./money.ts";

/**
 * Importación de gastos fijos pegando las filas del Excel.
 *
 * El usuario lleva sus gastos fijos en una hoja de cálculo y quiere seguir
 * llevándolos ahí: la importación no es una carga de una sola vez, es la vía de
 * sincronización. Por eso se pega texto en vez de correr un script — cuando el
 * Excel cambie, se vuelve a pegar.
 *
 * El formato es el de la hoja, en este orden:
 *
 * ```
 * Gasto             Categoría      Precio por cargo   Cada N meses
 * Claude Max        Tecnología     $112.00            1
 * Google AI Plus    Tecnología     $112.00            12
 * ```
 *
 * ## Tolerante a propósito
 *
 * Igual que `parseCsv` (§12), una fila mala no cuesta la importación entera: se
 * recoge en `issues` y las demás siguen. Copiar de una hoja de cálculo produce
 * basura con facilidad —filas vacías, la fila de totales, una cabecera repetida
 * a media tabla— y abortar por eso obligaría a limpiar el texto a mano.
 */

/** Techo de periodicidad, el mismo que el CHECK de la migración 0004. */
const MAX_MESES = 120;

/** Longitud máxima del nombre, la misma que valida el API. */
const MAX_NOMBRE = 100;

export interface ParsedFixedExpenseRow {
  name: string;
  /** Nombre de la categoría tal cual venía. Vacío si la fila no traía. */
  categoryName: string;
  /** Importe de CADA recibo, no el equivalente mensual. */
  amount: number;
  everyMonths: number;
}

export interface ImportParseIssue {
  /** Línea dentro del texto pegado, contando desde 1. */
  line: number;
  message: string;
  raw: string;
}

export interface ImportParseResult {
  rows: ParsedFixedExpenseRow[];
  issues: ImportParseIssue[];
}

// ---------------------------------------------------------------------------
// Normalización de nombres
// ---------------------------------------------------------------------------

/**
 * Clave con la que se compara un nombre: sin acentos, sin mayúsculas y con los
 * espacios colapsados.
 *
 * Es lo que hace **idempotente** la importación. Al volver a pegar la misma
 * tabla, «Teléfono» tiene que reconocer al «TELEFONO» que ya está guardado en
 * vez de crear un segundo gasto: la hoja de cálculo no guarda identificadores,
 * así que el nombre es la única clave natural que hay.
 *
 * Se usa igual para casar las categorías por nombre.
 */
export function claveDeNombre(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      // Quita los diacríticos que la descomposición deja sueltos. El rango va
      // escapado y no literal: son caracteres invisibles, y escritos tal cual en
      // el fuente cualquier edición posterior los rompe sin que se note — el
      // mismo motivo por el que el BOM de `csv.ts` se construye por codepoint.
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
  );
}

// ---------------------------------------------------------------------------
// Lectura del texto pegado
// ---------------------------------------------------------------------------

/**
 * Parte una línea en celdas.
 *
 * Se admiten cuatro separadores porque el texto puede venir de sitios muy
 * distintos: el tabulador es lo que pone el portapapeles al copiar de Excel o
 * de Google Sheets, la barra vertical es una tabla de Markdown pegada desde un
 * documento, el punto y coma es lo que exporta Excel en configuración regional
 * española, y varios espacios seguidos son una tabla alineada a mano.
 *
 * **La coma NO es separador, deliberadamente.** Un importe como `1,234.56` la
 * lleva dentro, y partir por comas rompería justo las filas de los gastos más
 * caros. Quien exporte un CSV separado por comas tiene el importador de §12.
 */
function partirEnCeldas(linea: string): string[] {
  if (linea.includes("\t")) return linea.split("\t");

  if (linea.includes("|")) {
    const celdas = linea.split("|");
    // `| a | b |` deja una celda vacía en cada punta al partir; son del formato,
    // no datos, y solo se quitan si de verdad están vacías.
    if (celdas[0]!.trim() === "") celdas.shift();
    if (celdas.length > 0 && celdas[celdas.length - 1]!.trim() === "") celdas.pop();
    return celdas;
  }

  if (linea.includes(";")) return linea.split(";");

  return linea.split(/ {2,}/);
}

/** Cabeceras conocidas de la primera columna. */
const ENCABEZADOS_NOMBRE = new Set(["gasto", "nombre", "concepto", "descripcion"]);

/**
 * ¿Es esta línea la cabecera de la tabla?
 *
 * Se mira la primera celda contra los rótulos conocidos y, como red de
 * seguridad, que ninguna celda tenga un número: una fila de datos siempre
 * tiene importe y periodicidad, así que una fila sin ninguna cifra no puede
 * serlo.
 */
function esCabecera(celdas: string[]): boolean {
  const primera = claveDeNombre(celdas[0] ?? "");
  if (!ENCABEZADOS_NOMBRE.has(primera)) return false;
  return !celdas.some((celda) => /\d/.test(celda));
}

/** Separador de una tabla de Markdown: `|---|:---:|`. */
function esSeparadorMarkdown(celdas: string[]): boolean {
  return celdas.length > 0 && celdas.every((celda) => /^:?-{2,}:?$/.test(celda.trim()));
}

/**
 * Lee las filas de gastos fijos de un texto pegado.
 *
 * No toca la base ni valida contra ella: solo convierte texto en filas para que
 * la pantalla pueda enseñar la vista previa **antes** de que el usuario
 * confirme. Todo lo que dependa de los datos ya guardados —si un gasto ya
 * existe, si la categoría hay que crearla— lo decide el servidor.
 */
export function parsePastedFixedExpenses(texto: string): ImportParseResult {
  const rows: ParsedFixedExpenseRow[] = [];
  const issues: ImportParseIssue[] = [];
  /** Dónde quedó cada nombre ya leído, para detectar repetidos en el pegado. */
  const posiciones = new Map<string, number>();

  const lineas = texto.split(/\r?\n/);

  for (let i = 0; i < lineas.length; i++) {
    const raw = lineas[i]!;
    const numero = i + 1;
    if (raw.trim() === "") continue;

    const celdas = partirEnCeldas(raw).map((celda) => celda.trim());
    if (esCabecera(celdas) || esSeparadorMarkdown(celdas)) continue;

    // Con 4 o más celdas se lee el orden completo de la hoja; lo que sobre por
    // la derecha se ignora, que es lo que pasa al copiar columnas de más.
    // Con exactamente 3 se asume que falta la categoría, no la periodicidad:
    // un gasto sin categoría sigue siendo utilizable, uno sin cada-cuánto no.
    let nombre: string;
    let categoria: string;
    let importeTexto: string;
    let mesesTexto: string;

    if (celdas.length >= 4) {
      [nombre, categoria, importeTexto, mesesTexto] = celdas as [
        string,
        string,
        string,
        string,
      ];
    } else if (celdas.length === 3) {
      [nombre, importeTexto, mesesTexto] = celdas as [string, string, string];
      categoria = "";
    } else {
      issues.push({
        line: numero,
        message:
          "La fila no tiene columnas suficientes (mínimo: nombre, importe y cada cuántos meses)",
        raw,
      });
      continue;
    }

    if (nombre === "") {
      issues.push({ line: numero, message: "Falta el nombre del gasto", raw });
      continue;
    }
    if (nombre.length > MAX_NOMBRE) {
      issues.push({
        line: numero,
        message: `El nombre pasa de ${MAX_NOMBRE} caracteres`,
        raw,
      });
      continue;
    }

    const amount = parseAmountInput(importeTexto);
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      issues.push({
        line: numero,
        message: `Importe inválido: "${importeTexto}"`,
        raw,
      });
      continue;
    }

    // La periodicidad se lee con el mismo parser que el importe para que
    // aguante un "12 meses" o un "1.0" salido de una celda con formato, pero
    // después tiene que ser un entero dentro del rango que admite el esquema.
    const meses = parseAmountInput(mesesTexto);
    if (meses === null || !Number.isInteger(meses) || meses < 1 || meses > MAX_MESES) {
      issues.push({
        line: numero,
        message: `Cada cuántos meses inválido: "${mesesTexto}" (un entero de 1 a ${MAX_MESES})`,
        raw,
      });
      continue;
    }

    // Un nombre repetido DENTRO del mismo pegado se queda con la última fila.
    // Es lo que hace la propia hoja de cálculo cuando se corrige una línea sin
    // borrar la vieja, y avisar de ello vale más que crear dos gastos iguales.
    const clave = claveDeNombre(nombre);
    const anterior = posiciones.get(clave);
    if (anterior !== undefined) {
      rows[anterior] = {
        name: nombre,
        categoryName: categoria,
        amount,
        everyMonths: meses,
      };
      issues.push({
        line: numero,
        message: `"${nombre}" está repetido en el texto; se usa esta última fila`,
        raw,
      });
      continue;
    }

    posiciones.set(clave, rows.length);
    rows.push({ name: nombre, categoryName: categoria, amount, everyMonths: meses });
  }

  return { rows, issues };
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

/**
 * Nombres de categoría que aparecen en las filas, sin repetir y conservando la
 * primera grafía vista.
 *
 * Se conserva la grafía original —«Tecnología» y no «tecnologia»— porque es la
 * que se va a guardar si la categoría hay que crearla, y la que el usuario
 * espera ver en la pantalla.
 */
export function categoryNamesIn(rows: readonly ParsedFixedExpenseRow[]): string[] {
  const porClave = new Map<string, string>();
  for (const fila of rows) {
    if (fila.categoryName === "") continue;
    const clave = claveDeNombre(fila.categoryName);
    if (!porClave.has(clave)) porClave.set(clave, fila.categoryName);
  }
  return [...porClave.values()];
}

/**
 * Icono para una categoría que hay que crear.
 *
 * Cubre los nombres que trae la hoja del usuario y los sinónimos evidentes; lo
 * que no reconozca cae en el icono genérico, que es exactamente lo que hace la
 * app Android cuando no sabe mapear uno (`FALLBACK_ICON`).
 */
export function iconoParaCategoria(nombre: string): IconName {
  const clave = claveDeNombre(nombre);
  for (const [icono, nombres] of ICONO_POR_CATEGORIA) {
    if (nombres.includes(clave)) return icono;
  }
  return FALLBACK_ICON;
}

const ICONO_POR_CATEGORIA: readonly (readonly [IconName, readonly string[]])[] = [
  ["Computer", ["tecnologia", "tecnologia y suscripciones", "software", "internet"]],
  ["DirectionsCar", ["transporte", "coche", "carro", "auto", "gasolina"]],
  ["Movie", ["entretenimiento", "ocio", "streaming"]],
  ["LocalHospital", ["salud", "medico", "farmacia", "gimnasio"]],
  ["Restaurant", ["alimentacion", "comida", "supermercado", "compra semanal"]],
  ["ShoppingCart", ["personal", "cuidado personal", "compras", "ropa"]],
  ["Home", ["hogar", "casa", "vivienda", "alquiler"]],
  ["Lightbulb", ["servicios", "suministros", "luz", "agua"]],
  ["School", ["educacion", "formacion", "cursos"]],
];

/**
 * Color para una categoría que hay que crear.
 *
 * Se elige de la paleta de la app **en función del nombre**, no al azar ni por
 * el orden de llegada: así la misma categoría sale siempre del mismo color,
 * aunque se importe en otra máquina o en otro orden, y dos importaciones de la
 * misma hoja no dejan la pantalla cambiando de colores.
 */
export function colorParaCategoria(nombre: string): string {
  const clave = claveDeNombre(nombre);
  let acumulado = 0;
  for (let i = 0; i < clave.length; i++) {
    // Hash multiplicativo sencillo (djb2 recortado). No necesita ser bueno: solo
    // repartir y, sobre todo, ser estable entre ejecuciones.
    acumulado = (acumulado * 33 + clave.charCodeAt(i)) % 1_000_003;
  }
  return CATEGORY_PALETTE[acumulado % CATEGORY_PALETTE.length]!;
}
