import { type SQL, getTableName, sql } from "drizzle-orm";

import { walletAccounts } from "./schema.ts";

/**
 * Fragmentos de SQL que se repiten en varias rutas.
 */

/**
 * Referencia calificada a `wallet_accounts.id`, para correlacionar subconsultas.
 *
 * Hay que construirla a mano. Interpolar `${walletAccounts.id}` dentro de un
 * `sql` que ya tiene su propio FROM hace que Drizzle la renderice como `"id"`,
 * sin el nombre de la tabla. En SQLite eso no es un error: `transactions`
 * también tiene una columna `id`, así que la comparación se resuelve contra
 * ella, nunca casa, y la subconsulta devuelve 0 **en silencio**.
 */
const CUENTA_ID = sql`${sql.identifier(getTableName(walletAccounts))}.${sql.identifier("id")}`;

/**
 * Neto de movimientos de una cuenta: entradas menos salidas.
 *
 * Es el mismo CASE que `TransactionDao.observeAccountBalanceDelta` en Android
 * (§8.1), más el filtro de borrado lógico que aquí sí hace falta.
 *
 * Suman `INCOME` y las transferencias entrantes; restan `EXPENSE` y las
 * salientes. La regla vive también en `src/lib/balance.ts` para el cliente, y
 * hay un test que comprueba que las dos coinciden.
 */
export function accountBalanceDelta(): SQL<number> {
  return sql<number>`COALESCE((
    SELECT
        COALESCE(SUM(CASE WHEN t.type = 'INCOME'
                            OR (t.type = 'TRANSFER' AND t.is_outgoing = 0)
                          THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.type = 'EXPENSE'
                            OR (t.type = 'TRANSFER' AND t.is_outgoing = 1)
                          THEN t.amount ELSE 0 END), 0)
    FROM transactions t
    WHERE t.account_id = ${CUENTA_ID}
      AND t.deleted_at IS NULL
  ), 0)`;
}

/** Balance actual = balance inicial + neto de movimientos. */
export function accountCurrentBalance(): SQL<number> {
  return sql<number>`(${walletAccounts.initialBalance} + ${accountBalanceDelta()})`;
}
