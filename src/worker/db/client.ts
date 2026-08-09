import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema.ts";

/**
 * Cliente de Drizzle sobre D1.
 *
 * Se construye por petición: en Workers los bindings solo existen dentro del
 * handler. Es barato — es un envoltorio del binding, no abre ninguna conexión.
 */
export function createDb(env: Env) {
  // Sin `casing`: cada columna declara su nombre real en schema.ts, así que no
  // hay conversión automática que pueda discrepar del SQL de las migraciones.
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof createDb>;
