import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";

import { anchorDayFrom, nextDueDate } from "@/lib/gastos-fijos.ts";
import { uuidv7 } from "@/lib/id.ts";
import {
  claveDeNombre,
  colorParaCategoria,
  iconoParaCategoria,
} from "@/lib/importar-gastos-fijos.ts";
import type { FixedExpense } from "@/shared/types.ts";

import type { AppEnv } from "../context.ts";
import { categories, fixedExpenses, transactions } from "../db/schema.ts";
import { Validator } from "../validation.ts";

/**
 * Gastos fijos recurrentes.
 *
 * El costo mensual equivalente NO se guarda: es un derivado de `amount` y
 * `everyMonths`, y lo calcula `lib/gastos-fijos.ts` en los dos lados. Guardarlo
 * sería tener la misma verdad en dos sitios que pueden discrepar.
 */
const app = new Hono<AppEnv>();

/** Techo de periodicidad, igual que el CHECK de la migración 0004. */
const MAX_MESES = 120;

const selection = {
  id: fixedExpenses.id,
  name: fixedExpenses.name,
  amount: fixedExpenses.amount,
  everyMonths: fixedExpenses.everyMonths,
  nextDueDate: fixedExpenses.nextDueDate,
  anchorDay: fixedExpenses.anchorDay,
  accountId: fixedExpenses.accountId,
  categoryId: fixedExpenses.categoryId,
  isActive: fixedExpenses.isActive,
  note: fixedExpenses.note,
  createdAt: fixedExpenses.createdAt,
  updatedAt: fixedExpenses.updatedAt,
};

app.get("/", async (c) => {
  const rows = await c
    .get("db")
    .select(selection)
    .from(fixedExpenses)
    .where(
      and(eq(fixedExpenses.userId, c.get("userId")), isNull(fixedExpenses.deletedAt)),
    )
    .orderBy(asc(fixedExpenses.nextDueDate));

  return c.json(rows as FixedExpense[]);
});

/** Campos comunes de alta y edición. */
function parseBody(v: Validator) {
  const name = v.requiredString("name", 100);
  const amount = v.positiveAmount("amount");
  const everyMonths = v.number("everyMonths", { min: 1, max: MAX_MESES });
  const nextDue = v.timestamp("nextDueDate");
  const accountId = v.nullableRef("accountId");
  const categoryId = v.nullableRef("categoryId");
  const isActive = v.boolean("isActive", true);
  const note = v.optionalString("note", 500);

  if (!Number.isInteger(everyMonths)) {
    v.reject("everyMonths", "Debe ser un número entero de meses");
  }

  return { name, amount, everyMonths, nextDue, accountId, categoryId, isActive, note };
}

/**
 * Importación por pegado: crea los que faltan y actualiza los que ya están.
 *
 * ## Qué sincroniza y qué NO
 *
 * La hoja de cálculo de la que sale esto solo tiene cuatro columnas: nombre,
 * categoría, importe y cada cuántos meses. El vencimiento y la cuenta de la que
 * sale el dinero **no están en el Excel** y se rellenan después desde la app.
 *
 * Por eso, al reconocer un gasto que ya existe, solo se pisan los tres campos
 * que el Excel conoce de verdad —importe, periodicidad y categoría— y se dejan
 * intactos `next_due_date`, `account_id` y `is_active`. Si no fuera así, volver
 * a pegar la hoja para actualizar un precio borraría de golpe todas las fechas
 * y cuentas que se hubieran configurado a mano, que es justo el trabajo que la
 * hoja no puede reponer.
 *
 * ## Idempotencia
 *
 * La clave es el **nombre normalizado** (`claveDeNombre`): sin acentos, sin
 * mayúsculas y con los espacios colapsados. La hoja no guarda identificadores,
 * así que el nombre es la única clave natural que hay. Pegar dos veces lo mismo
 * actualiza, no duplica.
 */
app.post("/import", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");

  const v = new Validator(await c.req.json());
  const items = parseImportItems(v);
  const defaultNextDue = v.timestamp("defaultNextDueDate");
  const defaultAccountId = v.nullableRef("defaultAccountId");
  v.throwIfInvalid();

  const [gastosExistentes, categoriasExistentes] = await Promise.all([
    db
      .select({
        id: fixedExpenses.id,
        name: fixedExpenses.name,
      })
      .from(fixedExpenses)
      .where(and(eq(fixedExpenses.userId, userId), isNull(fixedExpenses.deletedAt))),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.type, "EXPENSE"),
          isNull(categories.deletedAt),
        ),
      ),
  ]);

  const gastoPorNombre = new Map(
    gastosExistentes.map((g) => [claveDeNombre(g.name), g.id]),
  );
  const categoriaPorNombre = new Map(
    categoriasExistentes.map((cat) => [claveDeNombre(cat.name), cat.id]),
  );

  const now = Date.now();
  const timeZone = c.get("timeZone");
  const sentencias = [];
  const createdCategories: string[] = [];

  // Primero las categorías que falten: los gastos de después las referencian, y
  // en un mismo `batch` de D1 las sentencias corren en orden.
  for (const item of items) {
    if (item.categoryName === "") continue;
    const clave = claveDeNombre(item.categoryName);
    if (categoriaPorNombre.has(clave)) continue;

    const idCategoria = uuidv7();
    categoriaPorNombre.set(clave, idCategoria);
    createdCategories.push(item.categoryName);
    sentencias.push(
      db.insert(categories).values({
        id: idCategoria,
        userId,
        name: item.categoryName,
        type: "EXPENSE",
        iconName: iconoParaCategoria(item.categoryName),
        colorHex: colorParaCategoria(item.categoryName),
        // Creada por una importación, no por la siembra del registro.
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  let created = 0;
  let updated = 0;

  for (const item of items) {
    const categoryId =
      item.categoryName === ""
        ? null
        : (categoriaPorNombre.get(claveDeNombre(item.categoryName)) ?? null);
    const existente = gastoPorNombre.get(claveDeNombre(item.name));

    if (existente) {
      updated += 1;
      sentencias.push(
        db
          .update(fixedExpenses)
          .set({
            // Solo lo que el Excel sabe. Ver la nota de arriba.
            name: item.name,
            amount: item.amount,
            everyMonths: item.everyMonths,
            categoryId,
            ...(item.nextDueDate === undefined
              ? {}
              : {
                  nextDueDate: item.nextDueDate,
                  anchorDay: anchorDayFrom(item.nextDueDate, timeZone),
                }),
            updatedAt: now,
          })
          .where(and(eq(fixedExpenses.id, existente), eq(fixedExpenses.userId, userId))),
      );
      continue;
    }

    created += 1;
    const nextDue = item.nextDueDate ?? defaultNextDue;
    const idGasto = uuidv7();
    // Se registra en el mapa para que una fila repetida que el cliente no haya
    // filtrado actualice a la recién creada en vez de insertar otra.
    gastoPorNombre.set(claveDeNombre(item.name), idGasto);
    sentencias.push(
      db.insert(fixedExpenses).values({
        id: idGasto,
        userId,
        name: item.name,
        amount: item.amount,
        everyMonths: item.everyMonths,
        nextDueDate: nextDue,
        anchorDay: anchorDayFrom(nextDue, timeZone),
        accountId: defaultAccountId,
        categoryId,
        isActive: true,
        note: "",
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  // `batch` en vez de sentencias sueltas: una importación a medias dejaría
  // categorías creadas sin sus gastos, o la mitad de la hoja cargada.
  if (sentencias.length > 0) {
    await db.batch(sentencias as [(typeof sentencias)[number], ...typeof sentencias]);
  }

  return c.json({ created, updated, createdCategories });
});

/** Máximo de filas por importación. Una hoja de gastos fijos no llega ni cerca. */
const MAX_FILAS_IMPORTACION = 200;

interface ImportItem {
  name: string;
  amount: number;
  everyMonths: number;
  categoryName: string;
  nextDueDate: number | undefined;
}

/**
 * Valida la lista de filas.
 *
 * Se revalida entera aunque el cliente ya la haya leído con
 * `parsePastedFixedExpenses`: lo que llega por HTTP no es de fiar, y el parser
 * del navegador es una comodidad, no una barrera.
 */
function parseImportItems(v: Validator): ImportItem[] {
  const crudo = v.array("items", MAX_FILAS_IMPORTACION);
  const items: ImportItem[] = [];

  crudo.forEach((fila, indice) => {
    if (typeof fila !== "object" || fila === null) {
      v.reject(`items.${indice}`, "Cada fila debe ser un objeto");
      return;
    }

    // Cada fila se valida con su propio Validator para reutilizar las mismas
    // reglas de siempre; los errores se reetiquetan con el índice de la fila
    // para que la pantalla pueda decir cuál falla.
    const fv = new Validator(fila as Record<string, unknown>);
    const name = fv.requiredString("name", 100);
    const amount = fv.positiveAmount("amount");
    const everyMonths = fv.number("everyMonths", { min: 1, max: MAX_MESES });
    const categoryName = fv.optionalString("categoryName", 100).trim();
    const nextDueDate = fv.has("nextDueDate") ? fv.timestamp("nextDueDate") : undefined;

    if (!Number.isInteger(everyMonths)) {
      fv.reject("everyMonths", "Debe ser un número entero de meses");
    }

    const errores = fv.collectErrors();
    if (Object.keys(errores).length > 0) {
      for (const [campo, mensaje] of Object.entries(errores)) {
        v.reject(`items.${indice}.${campo}`, mensaje);
      }
      return;
    }

    items.push({ name, amount, everyMonths, categoryName, nextDueDate });
  });

  return items;
}

app.post("/", async (c) => {
  const v = new Validator(await c.req.json());
  const id = v.optionalId("id") ?? uuidv7();
  const datos = parseBody(v);
  v.throwIfInvalid();

  const now = Date.now();
  await c
    .get("db")
    .insert(fixedExpenses)
    .values({
      id,
      userId: c.get("userId"),
      name: datos.name,
      amount: datos.amount,
      everyMonths: datos.everyMonths,
      nextDueDate: datos.nextDue,
      // El ancla sale de la primera fecha que elige el usuario y ya no cambia.
      anchorDay: anchorDayFrom(datos.nextDue, c.get("timeZone")),
      accountId: datos.accountId,
      categoryId: datos.categoryId,
      isActive: datos.isActive,
      note: datos.note,
      createdAt: now,
      updatedAt: now,
    });

  return c.json({ id }, 201);
});

app.put("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");

  const v = new Validator(await c.req.json());
  const datos = parseBody(v);
  v.throwIfInvalid();

  const [existente] = await db
    .select({ id: fixedExpenses.id })
    .from(fixedExpenses)
    .where(
      and(
        eq(fixedExpenses.id, id),
        eq(fixedExpenses.userId, userId),
        isNull(fixedExpenses.deletedAt),
      ),
    );

  if (!existente) return c.json({ error: "Gasto fijo no encontrado" }, 404);

  await db
    .update(fixedExpenses)
    .set({
      name: datos.name,
      amount: datos.amount,
      everyMonths: datos.everyMonths,
      nextDueDate: datos.nextDue,
      // Al cambiar la fecha a mano se reancla: si el usuario la mueve al 15, su
      // intención es que a partir de ahora venza el 15.
      anchorDay: anchorDayFrom(datos.nextDue, c.get("timeZone")),
      accountId: datos.accountId,
      categoryId: datos.categoryId,
      isActive: datos.isActive,
      note: datos.note,
      updatedAt: Date.now(),
    })
    .where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, userId)));

  return c.json({ id });
});

/**
 * Marcar como pagado.
 *
 * Crea la transacción REAL en la cuenta indicada y avanza el vencimiento al
 * siguiente ciclo, todo en un mismo batch: o pasan las dos cosas o ninguna.
 *
 * Nunca ocurre solo. La app no genera transacciones automáticas por su cuenta:
 * hace falta que el usuario pulse el botón, que es lo que se pidió.
 */
app.post("/:id/pagar", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");

  const v = new Validator(await c.req.json().catch(() => ({})));
  const transactionId = v.optionalId("transactionId") ?? uuidv7();
  // Permite registrar el pago con la fecha real, no siempre "hoy".
  const paidAt = v.has("paidAt") ? v.timestamp("paidAt") : Date.now();
  v.throwIfInvalid();

  const [gasto] = await db
    .select()
    .from(fixedExpenses)
    .where(
      and(
        eq(fixedExpenses.id, id),
        eq(fixedExpenses.userId, userId),
        isNull(fixedExpenses.deletedAt),
      ),
    );

  if (!gasto) return c.json({ error: "Gasto fijo no encontrado" }, 404);
  if (gasto.accountId === null) {
    return c.json(
      { error: "Datos inválidos", fields: { accountId: "Elige de qué cuenta sale" } },
      400,
    );
  }

  const siguiente = nextDueDate(
    gasto.nextDueDate,
    gasto.everyMonths,
    gasto.anchorDay,
    c.get("timeZone"),
  );
  const now = Date.now();

  await db.batch([
    db.insert(transactions).values({
      id: transactionId,
      userId,
      amount: gasto.amount,
      type: "EXPENSE",
      categoryId: gasto.categoryId,
      accountId: gasto.accountId,
      transferAccountId: null,
      transferGroupId: null,
      note: gasto.name,
      date: paidAt,
      isOutgoing: false,
      createdAt: now,
      updatedAt: now,
    }),
    db
      .update(fixedExpenses)
      .set({ nextDueDate: siguiente, updatedAt: now })
      .where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, userId))),
  ]);

  return c.json({ transactionId, nextDueDate: siguiente });
});

/**
 * Borrado lógico.
 *
 * Las transacciones que ya generó NO se tocan: son gastos reales que ocurrieron
 * y borrarlas descuadraría los balances.
 */
app.delete("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");

  const [existente] = await db
    .select({ id: fixedExpenses.id })
    .from(fixedExpenses)
    .where(
      and(
        eq(fixedExpenses.id, id),
        eq(fixedExpenses.userId, userId),
        isNull(fixedExpenses.deletedAt),
      ),
    );

  if (!existente) return c.json({ error: "Gasto fijo no encontrado" }, 404);

  const now = Date.now();
  await db
    .update(fixedExpenses)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, userId)));

  return c.json({ id });
});

export default app;
