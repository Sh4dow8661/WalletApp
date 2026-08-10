-- Presupuestos que cuentan solos por categoría.
--
-- Hasta ahora un presupuesto solo sumaba lo que se enlazaba A MANO, movimiento
-- a movimiento (`transaction_budget_ref`). Eso obliga a acordarse de enlazar
-- cada gasto, y un presupuesto de "Gasolina" que se olvida de enlazar miente.
--
-- El matching automático por categoría existía en la app Android y se quitó en
-- MIGRATION_4_5. Vuelve, pero con dos diferencias deliberadas respecto a
-- entonces (ver §20 de docs/ARCHITECTURE.md):
--
--   1. **Convive con el enlace manual en vez de sustituirlo.** Lo que cuenta es
--      la UNIÓN de ambas vías, y un movimiento que esté en las dos cuenta una
--      sola vez. Así no se pierde nada de lo ya enlazado y se puede seguir
--      metiendo un gasto suelto que no es de la categoría.
--   2. **Son varias categorías, no una.** De ahí que sea una tabla de unión y
--      no una columna en `budgets`.
--
-- No hay backfill que hacer: el gasto se calcula al leer, así que en cuanto se
-- le asigna una categoría a un presupuesto ya existente, lo que estaba
-- registrado en esa categoría dentro del período cuenta de inmediato.

-- Sigue el patrón de `transaction_budget_ref`, que es la tabla de unión que ya
-- había: clave primaria compuesta y nada más. No lleva `id`, ni `user_id`, ni
-- timestamps, ni `deleted_at`, a diferencia de las tablas del dominio — no es
-- una entidad con vida propia sino una relación entre dos que sí la tienen, y
-- el aislamiento por usuario lo dan las dos puntas.
CREATE TABLE budget_categories (
  budget_id   TEXT NOT NULL REFERENCES budgets(id)    ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (budget_id, category_id)
);

-- Por presupuesto: es como se leen las categorías de cada uno al pintar.
CREATE INDEX idx_budget_categories_budget ON budget_categories(budget_id);
-- Por categoría: lo usa el aviso de "esta categoría alimenta N presupuestos"
-- antes de borrarla.
CREATE INDEX idx_budget_categories_category ON budget_categories(category_id);
