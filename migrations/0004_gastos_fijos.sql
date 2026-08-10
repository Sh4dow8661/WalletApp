-- Gastos fijos recurrentes.
--
-- No todo se paga cada mes: un seguro puede ser anual y otra cosa semestral.
-- Guardando cada cuántos meses toca (`every_months`) se puede calcular el
-- COSTO MENSUAL EQUIVALENTE — lo que habría que apartar cada mes— que es la
-- cifra que hace falta para saber de verdad cuánto se va en gastos fijos.
--
-- `anchor_day` es el día del mes al que está anclado el recibo, y se guarda
-- APARTE del vencimiento a propósito. Un recibo del día 31 se recorta al 28 en
-- febrero; si el siguiente salto se calculase desde ese 28, el recibo se
-- quedaría clavado en el día 28 para siempre. Con el ancla, la serie correcta
-- es 31 → 28 → 31 → 30 → 31. Es el mismo criterio que ya usan los períodos de
-- presupuesto mensuales (§8.5).

CREATE TABLE fixed_expenses (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  amount        REAL    NOT NULL CHECK (amount > 0),
  -- 1 = mensual, 12 = anual. El techo evita periodicidades absurdas que
  -- desbordarían el cálculo de fechas.
  every_months  INTEGER NOT NULL CHECK (every_months >= 1 AND every_months <= 120),
  next_due_date INTEGER NOT NULL,
  anchor_day    INTEGER NOT NULL CHECK (anchor_day >= 1 AND anchor_day <= 31),
  -- De dónde sale el dinero. Puede ser una tarjeta: es justo el caso de las
  -- suscripciones. SET NULL para no perder el gasto fijo si la cuenta se borra
  -- de verdad (hoy el borrado es lógico, así que en la práctica no salta).
  account_id    TEXT    REFERENCES wallet_accounts(id) ON DELETE SET NULL,
  category_id   TEXT    REFERENCES categories(id) ON DELETE SET NULL,
  -- Inactivo: sigue en la lista pero ni suma al equivalente ni avisa.
  is_active     INTEGER NOT NULL DEFAULT 1,
  note          TEXT    NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  -- Borrado lógico, como el resto de las tablas del dominio.
  deleted_at    INTEGER
);

CREATE INDEX idx_fixed_expenses_user ON fixed_expenses(user_id);
CREATE INDEX idx_fixed_expenses_due ON fixed_expenses(user_id, next_due_date);
