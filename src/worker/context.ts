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
  // Puerta de sólo lectura para Miguel. Va antes que la sesión porque no es una
  // sesión: no hay cookie, ni usuario que haya hecho login, ni forma de escribir.
  const deMiguel = tokenDeLectura(c);
  if (deMiguel) {
    c.set("db", createDb(c.env));
    c.set("userId", deMiguel);
    // A propósito NO se llama a resolveTimeZone: esa función siembra al usuario
    // si le falta la fila de ajustes, y sembrar es escribir. Una ruta de sólo
    // lectura no puede crear datos, y menos por un MIGUEL_USER_ID mal escrito.
    c.set("timeZone", await leerZonaHoraria(c.env, deMiguel));
    await next();
    return;
  }

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
 * Autoriza a Miguel para leer, y devuelve de quién son los datos.
 *
 * Tres condiciones, y las tres son necesarias:
 *
 * 1. Los dos secretos configurados. Si falta cualquiera, la puerta no existe:
 *    un despliegue sin ellos se comporta como antes de que esto existiera.
 * 2. Sólo `GET`. Es lo que hace que sea de lectura de verdad y no una promesa:
 *    no depende de qué rutas se añadan mañana.
 * 3. El token correcto, comparado sin filtrar por tiempo.
 *
 * El `userId` sale de `MIGUEL_USER_ID`, o sea de la configuración del servidor,
 * nunca de la petición (§11). Quien llama no elige a quién mira.
 */
function tokenDeLectura(c: AppContext): string | null {
  const esperado = c.env.MIGUEL_TOKEN;
  const dueno = c.env.MIGUEL_USER_ID;
  if (!esperado || !dueno) return null;
  if (c.req.method !== "GET") return null;

  const dado = (c.req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!dado || !igualEnTiempoConstante(dado, esperado)) return null;

  return dueno;
}

/** Compara sin que el tiempo delate cuántos caracteres coincidían. */
function igualEnTiempoConstante(a: string, b: string): boolean {
  const codificar = new TextEncoder();
  const x = codificar.encode(a);
  const y = codificar.encode(b);
  // La longitud se mezcla en el resultado en vez de cortar antes, para no
  // filtrarla por el tiempo. El módulo evita salirse de `y` cuando difieren.
  let diferencia = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diferencia |= x[i]! ^ y[i % y.length]!;
  return diferencia === 0;
}

/** Como resolveTimeZone pero sin sembrar: para caminos que no pueden escribir. */
async function leerZonaHoraria(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT time_zone FROM user_settings WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ time_zone: string }>();

  return row?.time_zone ?? DEFAULT_TIME_ZONE;
}

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
