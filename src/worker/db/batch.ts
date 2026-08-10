import type { BatchItem } from "drizzle-orm/batch";

import type { Db } from "./client.ts";

/** Una sentencia de las que acepta `db.batch()`. */
export type Statement = BatchItem<"sqlite">;

/**
 * Ejecuta un batch construido dinámicamente.
 *
 * `db.batch()` exige una tupla con al menos un elemento, y las listas que se
 * arman con condicionales son simples arrays. Esto centraliza esa conversión —
 * y el caso de lista vacía, en el que no hay nada que ejecutar — para que no
 * haya un cast suelto en cada ruta.
 *
 * Un batch de D1 corre dentro de una única transacción implícita: o se aplican
 * todas las sentencias o ninguna. Es lo que hace que editar una transferencia no
 * pueda dejar una pata actualizada y la otra no (§8.2).
 */
export async function runBatch(db: Db, statements: Statement[]): Promise<void> {
  if (statements.length === 0) return;
  await db.batch(statements as [Statement, ...Statement[]]);
}
