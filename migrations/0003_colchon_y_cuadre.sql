-- Colchón por cuenta y registro del cuadre.
--
-- El colchón es el mínimo que no se quiere tocar: el dinero sigue en la cuenta
-- (el balance no cambia) pero deja de contar como disponible.
--
--     disponible = balance − colchón
--
-- Los tres campos llevan valor por defecto para que las cuentas que ya existen
-- se comporten EXACTAMENTE igual que antes: colchón 0 no descuenta nada y la
-- UI no enseña ni una palabra de más.

-- Mínimo que no se quiere gastar. Nunca negativo: un colchón negativo sería
-- «puedes gastar de más», que no significa nada.
ALTER TABLE wallet_accounts
  ADD COLUMN buffer_amount REAL NOT NULL DEFAULT 0 CHECK (buffer_amount >= 0);

-- Si se apaga, el importe se conserva pero no se descuenta. Es además el valor
-- que la pantalla de cuadre propone marcado o desmarcado para esa cuenta, que
-- es lo que se pidió: que la elección se recuerde.
ALTER TABLE wallet_accounts
  ADD COLUMN buffer_applied INTEGER NOT NULL DEFAULT 1;

-- Última vez que se cuadró la cuenta contra el saldo real. NULL = nunca.
ALTER TABLE wallet_accounts
  ADD COLUMN last_reconciled_at INTEGER;
