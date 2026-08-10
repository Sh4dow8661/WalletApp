-- Límite de crédito de las tarjetas.
--
-- Hasta ahora una tarjeta se listaba y se sumaba igual que una cuenta de
-- efectivo, lo cual es incorrecto: una tarjeta no es dinero que se tiene, es
-- deuda. Con el límite se puede calcular la utilización (deuda / límite), que
-- es la cifra que de verdad importa para el crédito.
--
-- Es NULLABLE a propósito: las tarjetas que ya existen se quedan sin límite y
-- la app enseña «sin límite configurado» en vez de inventarse un porcentaje.
--
-- El CHECK admite NULL y exige que, si hay valor, sea positivo — dividir por
-- cero o por un negativo daría infinito o el signo al revés. La regla de que
-- solo las tarjetas puedan tenerlo NO cabe en un CHECK de columna (tendría que
-- mirar `type`, y SQLite no deja añadir CHECK de tabla con ALTER TABLE), así
-- que la impone el Worker en `routes/accounts.ts` y hay tests que lo cubren.

ALTER TABLE wallet_accounts
  ADD COLUMN credit_limit REAL CHECK (credit_limit IS NULL OR credit_limit > 0);
