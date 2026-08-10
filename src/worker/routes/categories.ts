import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";

import { uuidv7 } from "@/lib/id.ts";
import { CATEGORY_TYPES, ICON_NAMES } from "@/shared/constants.ts";
import type { Category } from "@/shared/types.ts";

import type { AppEnv } from "../context.ts";
import { categories, transactions } from "../db/schema.ts";
import { Validator } from "../validation.ts";

/** CRUD de categorías. */
const app = new Hono<AppEnv>();

const selection = {
  id: categories.id,
  name: categories.name,
  type: categories.type,
  iconName: categories.iconName,
  colorHex: categories.colorHex,
  isDefault: categories.isDefault,
  createdAt: categories.createdAt,
  updatedAt: categories.updatedAt,
};

app.get("/", async (c) => {
  const rows = await c
    .get("db")
    .select(selection)
    .from(categories)
    .where(and(eq(categories.userId, c.get("userId")), isNull(categories.deletedAt)))
    .orderBy(asc(categories.createdAt));

  return c.json(rows as Category[]);
});

app.post("/", async (c) => {
  const v = new Validator(await c.req.json());
  const id = v.optionalId("id") ?? uuidv7();
  const name = v.requiredString("name", 100);
  const type = v.enum("type", CATEGORY_TYPES);
  const iconName = v.enum("iconName", ICON_NAMES);
  const colorHex = v.colorHex("colorHex");
  v.throwIfInvalid();

  const now = Date.now();
  await c
    .get("db")
    .insert(categories)
    .values({
      id,
      userId: c.get("userId"),
      name,
      type,
      iconName,
      colorHex,
      // isDefault solo lo pone la siembra del registro; una categoría creada a
      // mano nunca es "por defecto".
      isDefault: false,
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
  const name = v.requiredString("name", 100);
  const type = v.enum("type", CATEGORY_TYPES);
  const iconName = v.enum("iconName", ICON_NAMES);
  const colorHex = v.colorHex("colorHex");
  v.throwIfInvalid();

  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.userId, userId),
        isNull(categories.deletedAt),
      ),
    );

  if (!existing) return c.json({ error: "Categoría no encontrada" }, 404);

  await db
    .update(categories)
    .set({ name, type, iconName, colorHex, updatedAt: Date.now() })
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));

  return c.json({ id });
});

/**
 * Borrado lógico de la categoría; sus transacciones se quedan **sin categoría**.
 *
 * Es el equivalente al ON DELETE SET NULL de Android (§8.7): a diferencia de las
 * cuentas, borrar una categoría no borra el gasto — solo lo deja sin clasificar,
 * y sigue contando en los totales. La UI lo avisa antes de confirmar.
 */
app.delete("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");
  const now = Date.now();

  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.userId, userId),
        isNull(categories.deletedAt),
      ),
    );

  if (!existing) return c.json({ error: "Categoría no encontrada" }, 404);

  await db.batch([
    db
      .update(transactions)
      .set({ categoryId: null, updatedAt: now })
      .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, id))),
    db
      .update(categories)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(categories.id, id), eq(categories.userId, userId))),
  ]);

  return c.json({ id });
});

export default app;
