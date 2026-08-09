import { eq } from "drizzle-orm";
import { Hono } from "hono";

import {
  DEFAULT_TIME_ZONE,
  SUPPORTED_CURRENCIES,
  THEME_MODES,
} from "@/shared/constants.ts";
import type { UserSettings } from "@/shared/types.ts";

import type { AppEnv } from "../context.ts";
import { userSettings } from "../db/schema.ts";
import { Validator } from "../validation.ts";

/** Ajustes del usuario. Sustituye a `SettingsDataStore`. */
const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const [row] = await c
    .get("db")
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, c.get("userId")));

  // El middleware garantiza que la fila existe; este fallback es solo por si se
  // llegara aquí por otra vía.
  const settings: UserSettings = {
    currency: (row?.currency ?? "USD") as UserSettings["currency"],
    themeMode: (row?.themeMode ?? "SYSTEM") as UserSettings["themeMode"],
    timeZone: row?.timeZone ?? DEFAULT_TIME_ZONE,
    updatedAt: row?.updatedAt ?? Date.now(),
  };

  return c.json(settings);
});

/**
 * Actualiza los ajustes. Es un PATCH de hecho: solo se tocan los campos que
 * vienen en el cuerpo, para que cambiar el tema no pise la moneda.
 */
app.put("/", async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>;
  const v = new Validator(body);

  const changes: Partial<typeof userSettings.$inferInsert> = { updatedAt: Date.now() };
  if (v.has("currency")) changes.currency = v.enum("currency", SUPPORTED_CURRENCIES);
  if (v.has("themeMode")) changes.themeMode = v.enum("themeMode", THEME_MODES);
  if (v.has("timeZone")) changes.timeZone = v.timeZone("timeZone");
  v.throwIfInvalid();

  await c
    .get("db")
    .update(userSettings)
    .set(changes)
    .where(eq(userSettings.userId, c.get("userId")));

  const [row] = await c
    .get("db")
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, c.get("userId")));

  return c.json(row as UserSettings);
});

export default app;
