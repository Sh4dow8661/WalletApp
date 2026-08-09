import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";

import {
  type CsvRow,
  accountNamesIn,
  categoryNamesIn,
  csvFileName,
  pairTransfers,
  parseCsv,
  toCsv,
} from "@/lib/csv.ts";
import { uuidv7 } from "@/lib/id.ts";
import {
  type DatosImportados,
  ImportError,
  type ResumenImportacion,
  parseExportAndroid,
  transformarExport,
} from "@/lib/import-json.ts";
import {
  CATEGORY_PALETTE,
  DEFAULT_ACCOUNT_ICON,
  FALLBACK_ICON,
} from "@/shared/constants.ts";

import type { AppEnv } from "../context.ts";
import { type Statement, runBatch } from "../db/batch.ts";
import type { Db } from "../db/client.ts";
import {
  budgets,
  categories,
  transactionBudgetRef,
  transactions,
  userSettings,
  walletAccounts,
} from "../db/schema.ts";

/**
 * Importación y exportación de datos (§12).
 *
 * Importar **reemplaza** todo lo del usuario. Es lo que hace falta para migrar
 * desde la app Android, y además evita el problema de fusionar: sin una clave
 * estable compartida entre Room y D1, "añadir" acabaría duplicando cuentas y
 * categorías en cuanto se importara dos veces el mismo archivo.
 *
 * El export JSON usa el mismo formato que la app Android a propósito, así que el
 * importador de aquí sirve tanto para migrar como para restaurar una copia de
 * seguridad, y no hay dos formatos que mantener.
 */
const app = new Hono<AppEnv>();

/**
 * Variables que D1 admite en una sola sentencia.
 *
 * Es un límite duro de SQLite: pasarse devuelve `too many SQL variables`. Un
 * `INSERT` de varias filas gasta una variable por columna y por fila, así que
 * cuántas filas caben depende de la tabla.
 */
const MAX_VARIABLES_D1 = 100;

/**
 * Parte las filas en lotes que quepan en una sentencia.
 *
 * El número de columnas sale de las propias filas en vez de estar escrito a
 * mano: así, si mañana se añade una columna a una tabla, el tamaño del lote se
 * ajusta solo en vez de romperse en producción con un archivo grande.
 */
function lotes<T extends object>(filas: readonly T[]): T[][] {
  if (filas.length === 0) return [];

  const columnas = Object.keys(filas[0]!).length;
  const porLote = Math.max(1, Math.floor(MAX_VARIABLES_D1 / columnas));

  const resultado: T[][] = [];
  for (let i = 0; i < filas.length; i += porLote) {
    resultado.push(filas.slice(i, i + porLote));
  }
  return resultado;
}

/**
 * Borra **físicamente** todos los datos del usuario.
 *
 * Aquí sí es borrado real y no lógico: importar es reemplazar, y dejar las filas
 * viejas marcadas como borradas solo serviría para inflar la base y para que un
 * export posterior arrastrara dos juegos de datos distintos.
 */
function sentenciasDeBorrado(db: Db, userId: string): Statement[] {
  return [
    // Los enlaces primero: cuelgan de transacciones y presupuestos.
    db
      .delete(transactionBudgetRef)
      .where(
        inArray(
          transactionBudgetRef.transactionId,
          db
            .select({ id: transactions.id })
            .from(transactions)
            .where(eq(transactions.userId, userId)),
        ),
      ),
    db.delete(transactions).where(eq(transactions.userId, userId)),
    db.delete(budgets).where(eq(budgets.userId, userId)),
    db.delete(categories).where(eq(categories.userId, userId)),
    db.delete(walletAccounts).where(eq(walletAccounts.userId, userId)),
  ];
}

/** Convierte los datos ya transformados en sentencias de inserción. */
function sentenciasDeInsercion(
  db: Db,
  userId: string,
  datos: DatosImportados,
  ahora: number,
): Statement[] {
  const marcas = { userId, createdAt: ahora, updatedAt: ahora };
  const conMarcas = <T extends object>(filas: readonly T[]) =>
    filas.map((fila) => ({ ...fila, ...marcas }));

  const statements: Statement[] = [];

  for (const lote of lotes(conMarcas(datos.cuentas))) {
    statements.push(db.insert(walletAccounts).values(lote));
  }
  for (const lote of lotes(conMarcas(datos.categorias))) {
    statements.push(db.insert(categories).values(lote));
  }
  for (const lote of lotes(conMarcas(datos.presupuestos))) {
    statements.push(db.insert(budgets).values(lote));
  }
  for (const lote of lotes(conMarcas(datos.transacciones))) {
    statements.push(db.insert(transactions).values(lote));
  }
  for (const lote of lotes(datos.enlaces)) {
    statements.push(db.insert(transactionBudgetRef).values(lote).onConflictDoNothing());
  }

  return statements;
}

/**
 * Importa el volcado JSON de la app Android.
 *
 * Todo va en un único batch de D1, así que o entra el archivo entero o no entra
 * nada: una importación a medias —con las cuentas puestas y las transacciones
 * no— sería peor que no importar.
 */
app.post("/json", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const ahora = Date.now();

  let datos: DatosImportados;
  try {
    datos = transformarExport(parseExportAndroid(await c.req.text()), ahora);
  } catch (error) {
    if (error instanceof ImportError) return c.json({ error: error.message }, 400);
    throw error;
  }

  if (datos.cuentas.length === 0) {
    return c.json({ error: "El archivo no tiene ninguna cuenta que importar." }, 400);
  }

  await runBatch(db, [
    ...sentenciasDeBorrado(db, userId),
    ...sentenciasDeInsercion(db, userId, datos, ahora),
  ]);

  return c.json({ ok: true, resumen: datos.resumen });
});

/**
 * Importa un CSV de la app Android.
 *
 * Es el plan B. El CSV no guarda presupuestos, enlaces, balances iniciales,
 * colores, iconos, `includeInTotal` ni **la dirección de las transferencias**;
 * el resumen dice explícitamente qué no se pudo recuperar, en vez de dejar que
 * se descubra semanas después cuadrando saldos.
 */
app.post("/csv", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const ahora = Date.now();

  const { rows, issues } = parseCsv(await c.req.text(), c.get("timeZone"));

  if (rows.length === 0) {
    return c.json(
      {
        error: "El archivo no tiene ninguna transacción legible.",
        detalles: issues.slice(0, 5).map((i) => `Línea ${i.line}: ${i.message}`),
      },
      400,
    );
  }

  const datos = transformarCsv(rows, ahora);
  if (issues.length > 0) {
    datos.resumen.avisos.push(
      `${issues.length} línea(s) del archivo no se pudieron leer y se han saltado.`,
    );
  }

  await runBatch(db, [
    ...sentenciasDeBorrado(db, userId),
    ...sentenciasDeInsercion(db, userId, datos, ahora),
  ]);

  return c.json({ ok: true, resumen: datos.resumen });
});

/**
 * Convierte las filas de un CSV en datos importables.
 *
 * Las cuentas y categorías se crean solo por nombre, que es lo único que trae el
 * archivo: tipo `CASH`, balance inicial 0 y colores de la paleta por defecto.
 */
export function transformarCsv(rows: readonly CsvRow[], ahora: number): DatosImportados {
  const avisos: string[] = [];

  const idCuenta = new Map<string, string>();
  for (const nombre of accountNamesIn(rows)) idCuenta.set(nombre, uuidv7(ahora));

  const cuentas = [...idCuenta.entries()].map(([name, id]) => ({
    id,
    name,
    type: "CASH" as const,
    initialBalance: 0,
    colorHex: CATEGORY_PALETTE[8],
    iconName: DEFAULT_ACCOUNT_ICON.CASH,
    includeInTotal: true,
  }));

  const idCategoria = new Map<string, string>();
  const categorias = categoryNamesIn(rows).map(({ name, type }) => {
    const id = uuidv7(ahora);
    idCategoria.set(name, id);
    return {
      id,
      name,
      type,
      iconName: FALLBACK_ICON,
      colorHex: CATEGORY_PALETTE[12],
      isDefault: false,
    };
  });

  // Las dos patas de cada transferencia se reagrupan bajo un mismo grupo. Cuál
  // era la saliente el CSV no lo dice: `pairTransfers` toma la primera del
  // archivo, y por eso se avisa abajo.
  const { pairs, orphans } = pairTransfers(rows);
  const grupoPorFila = new Map<CsvRow, { grupo: string; saliente: boolean }>();
  for (const { outgoing, incoming } of pairs) {
    const grupo = uuidv7(ahora);
    grupoPorFila.set(outgoing, { grupo, saliente: true });
    grupoPorFila.set(incoming, { grupo, saliente: false });
  }

  const transacciones = rows.flatMap((row) => {
    const accountId = idCuenta.get(row.accountName);
    // Sin nombre de cuenta no hay dónde meter el movimiento.
    if (accountId === undefined) return [];

    const emparejada = grupoPorFila.get(row);

    return [
      {
        id: uuidv7(ahora),
        amount: row.amount,
        type: row.type,
        categoryId:
          row.type === "TRANSFER" ? null : (idCategoria.get(row.categoryName) ?? null),
        accountId,
        transferAccountId:
          row.type === "TRANSFER"
            ? (idCuenta.get(row.transferAccountName) ?? null)
            : null,
        transferGroupId: emparejada?.grupo ?? null,
        note: row.note,
        date: row.date,
        isOutgoing: emparejada?.saliente ?? false,
      },
    ];
  });

  if (pairs.length > 0) {
    avisos.push(
      `${pairs.length} transferencia(s) reconstruidas. El CSV no guarda cuál era la cuenta de ` +
        "salida, así que se ha tomado la primera de cada par en el archivo: revisa que la " +
        "dirección sea la correcta.",
    );
  }
  if (orphans.length > 0) {
    avisos.push(
      `${orphans.length} parte(s) de transferencia se quedaron sin pareja y se han importado ` +
        "sueltas. Habrá que arreglarlas a mano.",
    );
  }
  avisos.push(
    "El CSV no incluye presupuestos, enlaces a presupuestos, balances iniciales, colores, " +
      "iconos ni la marca de contar en el total: todo eso hay que rehacerlo. El export JSON de " +
      "la app Android sí lo trae.",
  );

  const resumen: ResumenImportacion = {
    cuentas: cuentas.length,
    categorias: categorias.length,
    transacciones: transacciones.length,
    presupuestos: 0,
    enlaces: 0,
    transferenciasEmparejadas: pairs.length,
    transferenciasHuerfanas: orphans.length,
    avisos,
  };

  return { cuentas, categorias, transacciones, presupuestos: [], enlaces: [], resumen };
}

/**
 * Copia de seguridad completa, en el mismo formato que exporta la app Android.
 *
 * Los identificadores se renumeran a enteros porque eso es lo que espera el
 * formato; da igual que no coincidan con los que tuvo Room, lo único que importa
 * es que las referencias internas del archivo sean coherentes entre sí.
 */
app.get("/json", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");

  const [cuentas, cats, txs, buds, ajustes] = await Promise.all([
    db
      .select()
      .from(walletAccounts)
      .where(and(eq(walletAccounts.userId, userId), isNull(walletAccounts.deletedAt))),
    db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), isNull(categories.deletedAt))),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt))),
    db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, userId), isNull(budgets.deletedAt))),
    db.select().from(userSettings).where(eq(userSettings.userId, userId)),
  ]);

  // Los enlaces se filtran por usuario con un JOIN y no por la lista de
  // transacciones: D1 solo admite 100 variables por sentencia, y aquí las
  // transacciones son justamente todas las del usuario.
  const enlaces = await db
    .select({
      transactionId: transactionBudgetRef.transactionId,
      budgetId: transactionBudgetRef.budgetId,
    })
    .from(transactionBudgetRef)
    .innerJoin(transactions, eq(transactions.id, transactionBudgetRef.transactionId))
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)));

  const numeroDe = new Map<string, number>();
  const numerar = (id: string): number => {
    const existente = numeroDe.get(id);
    if (existente !== undefined) return existente;
    const nuevo = numeroDe.size + 1;
    numeroDe.set(id, nuevo);
    return nuevo;
  };

  const cuerpo = {
    formato: "walletapp-export",
    version: 1,
    exportadoEn: Date.now(),
    zonaHoraria: ajustes[0]?.timeZone ?? c.get("timeZone"),
    moneda: ajustes[0]?.currency ?? "USD",
    app: { versionName: "pwa", dbVersion: 1 },
    cuentas: cuentas.map((a) => ({
      id: numerar(a.id),
      name: a.name,
      type: a.type,
      initialBalance: a.initialBalance,
      colorHex: a.colorHex,
      iconName: a.iconName,
      includeInTotal: a.includeInTotal,
    })),
    categorias: cats.map((k) => ({
      id: numerar(k.id),
      name: k.name,
      type: k.type,
      iconName: k.iconName,
      colorHex: k.colorHex,
      isDefault: k.isDefault,
    })),
    presupuestos: buds.map((b) => ({
      id: numerar(b.id),
      name: b.name,
      amount: b.amount,
      startDate: b.startDate,
      endDate: b.endDate,
      recurrence: b.recurrence,
    })),
    transacciones: txs.map((t) => ({
      id: numerar(t.id),
      amount: t.amount,
      type: t.type,
      categoryId: t.categoryId === null ? null : numerar(t.categoryId),
      accountId: numerar(t.accountId),
      transferAccountId:
        t.transferAccountId === null ? null : numerar(t.transferAccountId),
      note: t.note,
      date: t.date,
      isOutgoing: t.isOutgoing,
    })),
    // Se descarta el enlace a un presupuesto que no va en el archivo: dejarlo
    // metería en `enlaces` un número que no corresponde a nada.
    enlaces: enlaces
      .filter((e) => numeroDe.has(e.budgetId) && numeroDe.has(e.transactionId))
      .map((e) => ({
        transactionId: numerar(e.transactionId),
        budgetId: numerar(e.budgetId),
      })),
  };

  return c.json(cuerpo);
});

/** Exporta el CSV desde el servidor, con el formato exacto de la app Android. */
app.get("/csv", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");

  const [cuentas, cats, txs] = await Promise.all([
    // Sin filtrar por `deletedAt`: una transacción puede apuntar a una categoría
    // ya borrada, y dejar la columna vacía sería perder información.
    db.select().from(walletAccounts).where(eq(walletAccounts.userId, userId)),
    db.select().from(categories).where(eq(categories.userId, userId)),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt))),
  ]);

  const nombreCuenta = new Map(cuentas.map((a) => [a.id, a.name]));
  const nombreCategoria = new Map(cats.map((k) => [k.id, k.name]));

  const csv = toCsv(
    txs
      .slice()
      .sort((a, b) => b.date - a.date)
      .map((t) => ({
        date: t.date,
        type: t.type,
        amount: t.amount,
        categoryName:
          t.categoryId === null ? "" : (nombreCategoria.get(t.categoryId) ?? ""),
        accountName: nombreCuenta.get(t.accountId) ?? "",
        transferAccountName:
          t.transferAccountId === null
            ? ""
            : (nombreCuenta.get(t.transferAccountId) ?? ""),
        note: t.note,
      })),
    c.get("timeZone"),
  );

  return c.text(csv, 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${csvFileName()}"`,
  });
});

export default app;
