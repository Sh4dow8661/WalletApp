import {
  ACCOUNT_TYPES,
  type AccountType,
  BUDGET_RECURRENCES,
  type BudgetRecurrence,
  CATEGORY_PALETTE,
  CATEGORY_TYPES,
  type CategoryType,
  DEFAULT_ACCOUNT_ICON,
  FALLBACK_ICON,
  ICON_NAMES,
  type IconName,
  TRANSACTION_TYPES,
  type TransactionType,
} from "@/shared/constants.ts";

import { uuidv7 } from "./id.ts";

/**
 * Lectura del volcado JSON de la app Android (§12).
 *
 * El archivo lo genera "Exportar todo (JSON)" en Ajustes, y a diferencia del CSV
 * no pierde nada: trae las cinco tablas con sus identificadores originales, así
 * que aquí no hay que adivinar nada — ni la dirección de las transferencias, ni
 * los enlaces a presupuestos, ni los balances iniciales.
 *
 * Este módulo solo **transforma**: valida el archivo y traduce los
 * identificadores numéricos de Room a los UUID v7 que usa D1. Escribir en la
 * base es cosa de la ruta del Worker.
 *
 * El archivo viene de fuera, así que **nada se da por bueno**: cada campo se
 * comprueba y los valores raros se sustituyen por algo válido en vez de acabar
 * en la base y romper una pantalla más tarde.
 */

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

// ---------------------------------------------------------------------------
// Lectura defensiva
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function esObjeto(valor: unknown): valor is Json {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function texto(fila: Json, clave: string, porDefecto = ""): string {
  const v = fila[clave];
  return typeof v === "string" ? v : porDefecto;
}

function numero(fila: Json, clave: string, porDefecto = 0): number {
  const v = fila[clave];
  return typeof v === "number" && Number.isFinite(v) ? v : porDefecto;
}

function booleano(fila: Json, clave: string, porDefecto = false): boolean {
  const v = fila[clave];
  return typeof v === "boolean" ? v : porDefecto;
}

/**
 * Límite de crédito de un respaldo.
 *
 * Se aplican las mismas dos reglas que el API (`routes/accounts.ts`): solo en
 * tarjetas y solo si es positivo. Aquí no se rechaza el archivo entero por
 * esto — un respaldo viejo o tocado a mano simplemente se importa sin límite,
 * que es un estado válido, en vez de perder toda la importación.
 */
function limiteCredito(fila: Json, type: AccountType): number | null {
  if (type !== "CREDIT_CARD") return null;
  const v = fila.creditLimit;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** Identificador de Room: entero. Si no lo es, la fila se descarta. */
function idOriginal(fila: Json, clave: string): number | null {
  const v = fila[clave];
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

function unaDe<T extends string>(
  valor: string,
  admitidos: readonly T[],
  porDefecto: T,
): T {
  return (admitidos as readonly string[]).includes(valor) ? (valor as T) : porDefecto;
}

/** Color en `#RRGGBB`. Cualquier otra cosa se cambia por uno de la paleta. */
function color(valor: string, alternativa: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(valor) ? valor.toUpperCase() : alternativa;
}

// ---------------------------------------------------------------------------
// Validación del archivo
// ---------------------------------------------------------------------------

/** El archivo tal cual, ya comprobado que tiene la forma esperada. */
export interface ExportAndroid {
  formato: string;
  version: number;
  exportadoEn: number;
  zonaHoraria?: string;
  moneda?: string;
  cuentas: Json[];
  categorias: Json[];
  transacciones: Json[];
  presupuestos: Json[];
  enlaces: Json[];
  /**
   * Categorías que alimentan cada presupuesto (§20).
   *
   * **Opcional a propósito.** Ni la app Android ni los respaldos anteriores a
   * la migración 0005 la traen, y un archivo sin ella tiene que importar igual:
   * lo que se pierde es solo el automatismo, y los presupuestos quedan como
   * estaban, contando lo enlazado a mano.
   */
  presupuestoCategorias: Json[];
}

/** Secciones **obligatorias**: si falta una, el archivo no vale. */
const SECCIONES = [
  "cuentas",
  "categorias",
  "transacciones",
  "presupuestos",
  "enlaces",
] as const;

/** Nombre de la sección opcional de la 0005. Ver `ExportAndroid`. */
const SECCION_CATEGORIAS_PRESUPUESTO = "presupuestoCategorias";

/** Comprueba que el archivo es lo que dice ser, antes de tocar nada. */
export function parseExportAndroid(contenido: string): ExportAndroid {
  let datos: unknown;
  try {
    datos = JSON.parse(contenido);
  } catch {
    throw new ImportError("El archivo no es un JSON válido.");
  }

  if (!esObjeto(datos)) {
    throw new ImportError("El archivo no tiene el formato esperado.");
  }

  if (datos.formato !== "walletapp-export") {
    throw new ImportError(
      'Esto no parece un export de WalletApp. Usa "Exportar todo (JSON)" desde Ajustes en la app Android.',
    );
  }
  if (datos.version !== 1) {
    throw new ImportError(
      `El archivo dice ser de la versión ${JSON.stringify(datos.version)} y esta app solo entiende la 1.`,
    );
  }

  for (const clave of SECCIONES) {
    if (!Array.isArray(datos[clave])) {
      throw new ImportError(`Al archivo le falta la sección "${clave}".`);
    }
  }

  const opcional = datos[SECCION_CATEGORIAS_PRESUPUESTO];

  return {
    formato: "walletapp-export",
    version: 1,
    exportadoEn: numero(datos, "exportadoEn"),
    zonaHoraria: typeof datos.zonaHoraria === "string" ? datos.zonaHoraria : undefined,
    moneda: typeof datos.moneda === "string" ? datos.moneda : undefined,
    // Ausente o con basura dentro: lista vacía. No se rechaza el archivo por
    // una sección que los respaldos viejos ni siquiera tenían.
    presupuestoCategorias: Array.isArray(opcional) ? opcional.filter(esObjeto) : [],
    // Las entradas que no sean objetos se tiran ya: no hay nada que rescatar.
    ...(Object.fromEntries(
      SECCIONES.map((clave) => [clave, (datos[clave] as unknown[]).filter(esObjeto)]),
    ) as Record<(typeof SECCIONES)[number], Json[]>),
  };
}

// ---------------------------------------------------------------------------
// Transformación
// ---------------------------------------------------------------------------

/** Filas listas para insertar, ya con los identificadores de D1. */
export interface DatosImportados {
  cuentas: {
    id: string;
    name: string;
    type: AccountType;
    initialBalance: number;
    /** Solo en tarjetas. Los respaldos anteriores a 0002 no lo traen. */
    creditLimit: number | null;
    /** Los respaldos anteriores a 0003 no lo traen: entra como 0. */
    bufferAmount: number;
    bufferApplied: boolean;
    colorHex: string;
    iconName: IconName;
    includeInTotal: boolean;
  }[];
  categorias: {
    id: string;
    name: string;
    type: CategoryType;
    iconName: IconName;
    colorHex: string;
    isDefault: boolean;
  }[];
  transacciones: {
    id: string;
    amount: number;
    type: TransactionType;
    categoryId: string | null;
    accountId: string;
    transferAccountId: string | null;
    transferGroupId: string | null;
    note: string;
    date: number;
    isOutgoing: boolean;
  }[];
  presupuestos: {
    id: string;
    name: string;
    amount: number;
    startDate: number;
    endDate: number;
    recurrence: BudgetRecurrence;
  }[];
  enlaces: { transactionId: string; budgetId: string }[];
  presupuestoCategorias: { budgetId: string; categoryId: string }[];
  resumen: ResumenImportacion;
}

export interface ResumenImportacion {
  cuentas: number;
  categorias: number;
  transacciones: number;
  presupuestos: number;
  enlaces: number;
  /** Vínculos presupuesto↔categoría restaurados (§20). */
  presupuestoCategorias: number;
  /** Transferencias con sus dos patas correctamente emparejadas. */
  transferenciasEmparejadas: number;
  /**
   * Patas de transferencia que se quedaron sin pareja.
   *
   * Casi siempre son víctimas del bug de §8.2: la app Android descuadraba las
   * dos filas al editar o borrar, y ya no coinciden en importe o fecha. Se
   * importan igual —el dinero estaba ahí— pero conviene revisarlas.
   */
  transferenciasHuerfanas: number;
  /** Qué se descartó o se tuvo que suponer. */
  avisos: string[];
}

/** Una transferencia ya leída, con lo justo para emparejarla. */
interface PataTransferencia {
  idOriginal: number;
  amount: number;
  date: number;
  cuenta: number;
  cuentaDestino: number | null;
  isOutgoing: boolean;
}

/**
 * Traduce el volcado de Android a filas de D1.
 *
 * Los identificadores de Room son enteros por tabla; en D1 son UUID. Se
 * construye un mapa por tabla y se traduce toda referencia, de modo que los
 * enlaces entre transacciones, cuentas, categorías y presupuestos se conservan.
 */
export function transformarExport(
  datos: ExportAndroid,
  ahora: number = Date.now(),
): DatosImportados {
  const avisos: string[] = [];
  let descartadas = 0;

  // --- Cuentas -----------------------------------------------------------
  const idCuenta = new Map<number, string>();
  const cuentas = datos.cuentas.flatMap((fila) => {
    const original = idOriginal(fila, "id");
    const name = texto(fila, "name").trim();
    if (original === null || name === "") {
      descartadas++;
      return [];
    }

    const id = uuidv7(ahora);
    idCuenta.set(original, id);
    const type = unaDe(texto(fila, "type"), ACCOUNT_TYPES, "CASH");

    return [
      {
        id,
        name,
        type,
        initialBalance: numero(fila, "initialBalance"),
        // Solo se conserva en tarjetas y si es positivo: así un respaldo
        // manipulado no puede meter un límite en una cuenta de efectivo, que
        // es justo lo que el API rechaza.
        creditLimit: limiteCredito(fila, type),
        // Igual que el límite: en una tarjeta el colchón no aplica, y uno
        // negativo se ignora en vez de tumbar la importación entera.
        bufferAmount:
          type === "CREDIT_CARD" ? 0 : Math.max(0, numero(fila, "bufferAmount")),
        bufferApplied: booleano(fila, "bufferApplied", true),
        colorHex: color(texto(fila, "colorHex"), CATEGORY_PALETTE[8]),
        iconName: unaDe(texto(fila, "iconName"), ICON_NAMES, DEFAULT_ACCOUNT_ICON[type]),
        includeInTotal: booleano(fila, "includeInTotal", true),
      },
    ];
  });

  // --- Categorías --------------------------------------------------------
  const idCategoria = new Map<number, string>();
  const categorias = datos.categorias.flatMap((fila) => {
    const original = idOriginal(fila, "id");
    const name = texto(fila, "name").trim();
    if (original === null || name === "") {
      descartadas++;
      return [];
    }

    const id = uuidv7(ahora);
    idCategoria.set(original, id);

    return [
      {
        id,
        name,
        type: unaDe(texto(fila, "type"), CATEGORY_TYPES, "EXPENSE"),
        iconName: unaDe(texto(fila, "iconName"), ICON_NAMES, FALLBACK_ICON),
        colorHex: color(texto(fila, "colorHex"), CATEGORY_PALETTE[12]),
        isDefault: booleano(fila, "isDefault"),
      },
    ];
  });

  // --- Presupuestos ------------------------------------------------------
  const idPresupuesto = new Map<number, string>();
  const presupuestos = datos.presupuestos.flatMap((fila) => {
    const original = idOriginal(fila, "id");
    const name = texto(fila, "name").trim();
    if (original === null || name === "") {
      descartadas++;
      return [];
    }

    const id = uuidv7(ahora);
    idPresupuesto.set(original, id);

    return [
      {
        id,
        name,
        amount: numero(fila, "amount"),
        startDate: numero(fila, "startDate", ahora),
        endDate: numero(fila, "endDate", ahora),
        recurrence: unaDe(texto(fila, "recurrence"), BUDGET_RECURRENCES, "NONE"),
      },
    ];
  });

  // --- Transacciones -----------------------------------------------------
  //
  // Primera pasada: se leen y validan. La segunda reagrupa las transferencias,
  // que necesita ver todas las filas antes de decidir.
  const leidas = datos.transacciones.flatMap((fila) => {
    const original = idOriginal(fila, "id");
    const cuenta = idOriginal(fila, "accountId");
    const amount = numero(fila, "amount");

    // Sin cuenta no hay transacción posible, y un importe no positivo no lo
    // acepta ni el formulario de la app.
    if (original === null || cuenta === null || !idCuenta.has(cuenta) || amount <= 0) {
      descartadas++;
      return [];
    }

    const cuentaDestino = idOriginal(fila, "transferAccountId");
    const categoria = idOriginal(fila, "categoryId");

    return [
      {
        idOriginal: original,
        amount,
        type: unaDe(texto(fila, "type"), TRANSACTION_TYPES, "EXPENSE"),
        categoria,
        cuenta,
        cuentaDestino:
          cuentaDestino !== null && idCuenta.has(cuentaDestino) ? cuentaDestino : null,
        note: texto(fila, "note"),
        date: numero(fila, "date", ahora),
        isOutgoing: booleano(fila, "isOutgoing"),
      },
    ];
  });

  const { grupoPorTransaccion, emparejadas } = agruparTransferencias(
    leidas.filter(
      (t): t is (typeof leidas)[number] & PataTransferencia => t.type === "TRANSFER",
    ),
    ahora,
  );

  const idTransaccion = new Map<number, string>();
  const transacciones = leidas.map((t) => {
    const id = uuidv7(ahora);
    idTransaccion.set(t.idOriginal, id);

    return {
      id,
      amount: t.amount,
      type: t.type,
      // Las transferencias nunca llevan categoría (§8.2).
      categoryId:
        t.type === "TRANSFER" || t.categoria === null
          ? null
          : (idCategoria.get(t.categoria) ?? null),
      accountId: idCuenta.get(t.cuenta)!,
      transferAccountId:
        t.cuentaDestino !== null ? (idCuenta.get(t.cuentaDestino) ?? null) : null,
      transferGroupId: grupoPorTransaccion.get(t.idOriginal) ?? null,
      note: t.note,
      date: t.date,
      isOutgoing: t.isOutgoing,
    };
  });

  const patasTransferencia = leidas.filter((t) => t.type === "TRANSFER").length;
  const huerfanas = patasTransferencia - emparejadas * 2;
  if (huerfanas > 0) {
    avisos.push(
      `${huerfanas} parte${huerfanas === 1 ? "" : "s"} de transferencia se importó sin su pareja. ` +
        "Suele ser por el fallo de la app antigua al editar transferencias; revisa esos movimientos.",
    );
  }

  // --- Enlaces con presupuestos ------------------------------------------
  const enlaces = datos.enlaces.flatMap((fila) => {
    const tx = idOriginal(fila, "transactionId");
    const budget = idOriginal(fila, "budgetId");
    if (tx === null || budget === null) return [];

    const transactionId = idTransaccion.get(tx);
    const budgetId = idPresupuesto.get(budget);
    return transactionId && budgetId ? [{ transactionId, budgetId }] : [];
  });

  if (enlaces.length !== datos.enlaces.length) {
    avisos.push(
      `${datos.enlaces.length - enlaces.length} enlace(s) a presupuestos apuntaban a filas ` +
        "que no están en el archivo.",
    );
  }

  // --- Categorías de cada presupuesto (§20) ------------------------------
  //
  // Sección opcional: los respaldos anteriores a la 0005 y los de la app
  // Android no la traen, y entonces esto queda vacío sin más.
  const presupuestoCategorias = datos.presupuestoCategorias.flatMap((fila) => {
    const budget = idOriginal(fila, "budgetId");
    const categoria = idOriginal(fila, "categoryId");
    if (budget === null || categoria === null) return [];

    const budgetId = idPresupuesto.get(budget);
    const categoryId = idCategoria.get(categoria);
    return budgetId && categoryId ? [{ budgetId, categoryId }] : [];
  });

  if (presupuestoCategorias.length !== datos.presupuestoCategorias.length) {
    avisos.push(
      `${datos.presupuestoCategorias.length - presupuestoCategorias.length} categoría(s) de ` +
        "presupuesto apuntaban a filas que no están en el archivo.",
    );
  }
  if (descartadas > 0) {
    avisos.push(
      `${descartadas} fila(s) del archivo estaban incompletas y se han saltado.`,
    );
  }

  return {
    cuentas,
    categorias,
    transacciones,
    presupuestos,
    enlaces,
    presupuestoCategorias,
    resumen: {
      cuentas: cuentas.length,
      categorias: categorias.length,
      transacciones: transacciones.length,
      presupuestos: presupuestos.length,
      enlaces: enlaces.length,
      presupuestoCategorias: presupuestoCategorias.length,
      transferenciasEmparejadas: emparejadas,
      transferenciasHuerfanas: Math.max(huerfanas, 0),
      avisos,
    },
  };
}

/**
 * Reagrupa las dos patas de cada transferencia bajo un `transfer_group_id`.
 *
 * Con el JSON esto es fiable, porque trae `isOutgoing`: para cada pata saliente
 * se busca la entrante que le corresponde (mismo importe, misma fecha y cuentas
 * cruzadas). El CSV no permite esto y tiene que suponerlo — ver `pairTransfers`
 * en src/lib/csv.ts.
 */
function agruparTransferencias(
  patas: readonly PataTransferencia[],
  ahora: number,
): { grupoPorTransaccion: Map<number, string>; emparejadas: number } {
  const grupoPorTransaccion = new Map<number, string>();
  const entrantesLibres = patas.filter((t) => !t.isOutgoing);
  let emparejadas = 0;

  for (const saliente of patas.filter((t) => t.isOutgoing)) {
    const indice = entrantesLibres.findIndex(
      (e) =>
        e.amount === saliente.amount &&
        e.date === saliente.date &&
        e.cuenta === saliente.cuentaDestino &&
        e.cuentaDestino === saliente.cuenta,
    );
    if (indice === -1) continue;

    const entrante = entrantesLibres.splice(indice, 1)[0]!;
    const grupo = uuidv7(ahora);
    grupoPorTransaccion.set(saliente.idOriginal, grupo);
    grupoPorTransaccion.set(entrante.idOriginal, grupo);
    emparejadas++;
  }

  return { grupoPorTransaccion, emparejadas };
}
