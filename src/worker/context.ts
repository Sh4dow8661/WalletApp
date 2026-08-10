import type { Context, MiddlewareHandler } from "hono";

import { DEFAULT_TIME_ZONE } from "@/shared/constants.ts";

import { createAuth } from "./auth.ts";
import { type Db, createDb } from "./db/client.ts";
import { seedNewUser } from "./db/seed.ts";

/**
 * Tipos y middleware compartidos por todas las rutas del API.
 */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Db;
    userId: string;
    /** Zona horaria del usuario. Todo agregado por día o mes la usa (§8.6). */
    timeZone: string;
  };
}

export type AppContext = Context<AppEnv>;

/**
 * Exige sesión válida y deja `userId` y `timeZone` en el contexto.
 *
 * Esta es **la** frontera de seguridad del backend. Que el frontend esconda un
 * botón no protege nada: toda ruta bajo /api que no sea de auth pasa por aquí, y
 * a partir de este punto el `userId` viene de la sesión y jamás del cuerpo de la
 * petición ni de un parámetro (§11).
 */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const db = createDb(c.env);
  c.set("db", db);
  c.set("userId", session.user.id);
  c.set("timeZone", await resolveTimeZone(c.env, session.user.id));

  await next();
};

/**
 * Lee la zona horaria del usuario y, de paso, repara el caso raro de un usuario
 * sin fila de ajustes.
 *
 * Puede ocurrir si el hook de siembra del registro falló a medias: el usuario
 * existiría sin cuentas, categorías ni ajustes, y la app se vería vacía sin
 * explicación. Volver a sembrar aquí es seguro porque solo entra cuando no hay
 * ninguna fila de ajustes, y la siembra es un único batch atómico.
 */
async function resolveTimeZone(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT time_zone FROM user_settings WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ time_zone: string }>();

  if (row) return row.time_zone;

  await seedNewUser(env.DB, userId, Date.now());
  return DEFAULT_TIME_ZONE;
}
