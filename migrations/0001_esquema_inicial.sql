-- Migration number: 0001 	 2026-08-09T13:43:44.226Z
--
-- Esquema inicial de WalletApp en D1.
--
-- Dos bloques:
--   1. Tablas de Better Auth (user, session, account, verification), derivadas
--      del esquema que genera su CLI en src/worker/db/auth-schema.ts.
--   2. Tablas del dominio, portadas del Room de la app Android con los tres
--      cambios de §7: user_id en todas, IDs de texto (UUID v7) y `accounts`
--      renombrada a `wallet_accounts` para no chocar con la `account` de auth.
--
-- Las marcas de tiempo son epoch millis (INTEGER), igual que en Room.
-- `deleted_at` es borrado lógico: toda lectura filtra por `deleted_at IS NULL`.

-- ===========================================================================
-- 1. Better Auth
-- ===========================================================================

CREATE TABLE user (
  id             TEXT    PRIMARY KEY,
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image          TEXT,
  created_at     INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at     INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE TABLE session (
  id         TEXT    PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token      TEXT    NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  ip_address TEXT,
  user_agent TEXT,
  user_id    TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX session_userId_idx ON session(user_id);

CREATE TABLE account (
  id                       TEXT    PRIMARY KEY,
  account_id               TEXT    NOT NULL,
  provider_id              TEXT    NOT NULL,
  user_id                  TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token             TEXT,
  refresh_token            TEXT,
  id_token                 TEXT,
  access_token_expires_at  INTEGER,
  refresh_token_expires_at INTEGER,
  scope                    TEXT,
  password                 TEXT,
  created_at               INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at               INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
);
CREATE INDEX account_userId_idx ON account(user_id);

CREATE TABLE verification (
  id         TEXT    PRIMARY KEY,
  identifier TEXT    NOT NULL,
  value      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
);
CREATE INDEX verification_identifier_idx ON verification(identifier);

-- ===========================================================================
-- 2. Dominio
-- ===========================================================================

-- Cuentas monetarias del usuario.
CREATE TABLE wallet_accounts (
  id               TEXT    PRIMARY KEY,
  user_id          TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name             TEXT    NOT NULL,
  type             TEXT    NOT NULL CHECK (type IN ('CASH','BANK','CREDIT_CARD')),
  initial_balance  REAL    NOT NULL DEFAULT 0,
  color_hex        TEXT    NOT NULL,
  icon_name        TEXT    NOT NULL,
  include_in_total INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  deleted_at       INTEGER
);
CREATE INDEX idx_wallet_accounts_user ON wallet_accounts(user_id);

CREATE TABLE categories (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  type       TEXT    NOT NULL CHECK (type IN ('INCOME','EXPENSE')),
  icon_name  TEXT    NOT NULL,
  color_hex  TEXT    NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_categories_user ON categories(user_id);

CREATE TABLE transactions (
  id                  TEXT    PRIMARY KEY,
  user_id             TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount              REAL    NOT NULL,
  type                TEXT    NOT NULL CHECK (type IN ('INCOME','EXPENSE','TRANSFER')),
  category_id         TEXT    REFERENCES categories(id) ON DELETE SET NULL,
  account_id          TEXT    NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  transfer_account_id TEXT    REFERENCES wallet_accounts(id) ON DELETE SET NULL,
  -- Une las 2 filas de una transferencia (§8.2). No existía en Android, y su
  -- ausencia es la causa de que editar o borrar descuadrara los balances.
  transfer_group_id   TEXT,
  note                TEXT    NOT NULL DEFAULT '',
  date                INTEGER NOT NULL,
  is_outgoing         INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  deleted_at          INTEGER
);
CREATE INDEX idx_tx_user_date      ON transactions(user_id, date);
CREATE INDEX idx_tx_account        ON transactions(account_id);
CREATE INDEX idx_tx_category       ON transactions(category_id);
CREATE INDEX idx_tx_transfer_group ON transactions(transfer_group_id);

CREATE TABLE budgets (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  amount     REAL    NOT NULL,
  start_date INTEGER NOT NULL,
  end_date   INTEGER NOT NULL,
  recurrence TEXT    NOT NULL CHECK (recurrence IN ('NONE','WEEKLY','BIWEEKLY','MONTHLY')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_budgets_user ON budgets(user_id);

-- Enlace manual N:M transacción <-> presupuesto. Sin matching automático por
-- categoría ni cuenta: eso se eliminó en la migración 4->5 de Room (§8.4).
CREATE TABLE transaction_budget_ref (
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  budget_id      TEXT NOT NULL REFERENCES budgets(id)      ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, budget_id)
);
CREATE INDEX idx_tbr_budget ON transaction_budget_ref(budget_id);

-- Sustituye a SettingsDataStore.
CREATE TABLE user_settings (
  user_id    TEXT    PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  currency   TEXT    NOT NULL DEFAULT 'USD',
  theme_mode TEXT    NOT NULL DEFAULT 'SYSTEM' CHECK (theme_mode IN ('LIGHT','DARK','SYSTEM')),
  -- UTC-4 sin horario de verano. El default de §7 era America/Mexico_City, pero
  -- la zona real del usuario es Puerto Rico; con la de México los agregados por
  -- día saldrían corridos justo como el bug que corregimos.
  time_zone  TEXT    NOT NULL DEFAULT 'America/Puerto_Rico',
  updated_at INTEGER NOT NULL
);
