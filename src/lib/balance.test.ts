import { describe, expect, it } from "vitest";

import {
  type BalanceInput,
  accountBalance,
  balanceDelta,
  initialBalanceForDesiredCurrent,
  totalBalance,
  transactionDelta,
} from "./balance.ts";

const ingreso = (amount: number): BalanceInput => ({
  amount,
  type: "INCOME",
  isOutgoing: false,
});
const gasto = (amount: number): BalanceInput => ({
  amount,
  type: "EXPENSE",
  isOutgoing: false,
});
const sale = (amount: number): BalanceInput => ({
  amount,
  type: "TRANSFER",
  isOutgoing: true,
});
const entra = (amount: number): BalanceInput => ({
  amount,
  type: "TRANSFER",
  isOutgoing: false,
});

describe("transactionDelta", () => {
  it("suma los ingresos y resta los gastos", () => {
    expect(transactionDelta(ingreso(100))).toBe(100);
    expect(transactionDelta(gasto(40))).toBe(-40);
  });

  it("en una transferencia, resta en la cuenta origen y suma en la destino", () => {
    expect(transactionDelta(sale(50))).toBe(-50);
    expect(transactionDelta(entra(50))).toBe(50);
  });

  it("ignora isOutgoing en ingresos y gastos", () => {
    // isOutgoing solo tiene sentido en transferencias. Si llegara mal puesto en
    // un gasto, no debe cambiar el signo.
    expect(transactionDelta({ amount: 10, type: "EXPENSE", isOutgoing: true })).toBe(-10);
    expect(transactionDelta({ amount: 10, type: "INCOME", isOutgoing: true })).toBe(10);
  });
});

describe("accountBalance", () => {
  it("parte del balance inicial", () => {
    expect(accountBalance(500, [])).toBe(500);
  });

  it("aplica la mezcla de movimientos", () => {
    // 1000 + 250 (ingreso) − 80 (gasto) − 200 (sale) + 60 (entra) = 1030
    expect(accountBalance(1000, [ingreso(250), gasto(80), sale(200), entra(60)])).toBe(
      1030,
    );
  });

  it("admite balances negativos, como una tarjeta de crédito", () => {
    expect(accountBalance(0, [gasto(300)])).toBe(-300);
  });
});

describe("las dos patas de una transferencia se cancelan", () => {
  it("mover dinero entre cuentas propias no cambia el total", () => {
    // Esta es la propiedad que el bug de §8.2 rompía al editar: se actualizaba
    // solo la pata saliente y el total dejaba de cuadrar.
    const origen = accountBalance(1000, [sale(300)]);
    const destino = accountBalance(500, [entra(300)]);
    expect(origen).toBe(700);
    expect(destino).toBe(800);
    expect(origen + destino).toBe(1500); // el mismo total de antes
  });

  it("sigue cuadrando tras editar el importe en AMBAS patas", () => {
    // Editar bien: las dos filas pasan de 300 a 450.
    const origen = accountBalance(1000, [sale(450)]);
    const destino = accountBalance(500, [entra(450)]);
    expect(origen + destino).toBe(1500);
  });

  it("se descuadra si solo se edita una pata, que es el bug de Android", () => {
    // Documenta el fallo concreto que la PWA tiene que impedir: con
    // transfer_group_id, crear/editar/borrar operan siempre sobre las dos filas.
    const origen = accountBalance(1000, [sale(450)]); // editada
    const destino = accountBalance(500, [entra(300)]); // se quedó con el importe viejo
    expect(origen + destino).toBe(1350);
    expect(origen + destino).not.toBe(1500);
  });
});

describe("totalBalance", () => {
  it("suma solo las cuentas marcadas para el total", () => {
    const total = totalBalance([
      { currentBalance: 1000, includeInTotal: true },
      { currentBalance: 500, includeInTotal: true },
      { currentBalance: 9999, includeInTotal: false },
    ]);
    expect(total).toBe(1500);
  });

  it("da 0 sin cuentas", () => {
    expect(totalBalance([])).toBe(0);
  });

  it("resta las cuentas en negativo que sí cuentan", () => {
    const total = totalBalance([
      { currentBalance: 1000, includeInTotal: true },
      { currentBalance: -250, includeInTotal: true },
    ]);
    expect(total).toBe(750);
  });
});

describe("initialBalanceForDesiredCurrent — editar el balance actual (§8.3)", () => {
  it("despeja el inicial para que el actual sea el tecleado", () => {
    const movimientos = [ingreso(500), gasto(200)]; // neto +300
    const delta = balanceDelta(movimientos);
    const inicial = initialBalanceForDesiredCurrent(1000, delta);

    expect(inicial).toBe(700);
    // Y al recalcular, el balance actual es exactamente el que se tecleó.
    expect(accountBalance(inicial, movimientos)).toBe(1000);
  });

  it("con una cuenta sin movimientos, el inicial es el tecleado", () => {
    expect(initialBalanceForDesiredCurrent(250, 0)).toBe(250);
  });

  it("puede dar un inicial negativo si ya se ingresó más de lo que se quiere tener", () => {
    const movimientos = [ingreso(5000)];
    const inicial = initialBalanceForDesiredCurrent(100, balanceDelta(movimientos));
    expect(inicial).toBe(-4900);
    expect(accountBalance(inicial, movimientos)).toBe(100);
  });
});

describe("la regla de signos coincide con la del SQL del Worker", () => {
  it("reproduce el CASE de observeAccountBalanceDelta", () => {
    // El SQL de la app Android, y el del Worker, es:
    //   SUM(CASE WHEN type='INCOME' OR (type='TRANSFER' AND is_outgoing=0)
    //            THEN amount ELSE 0 END)
    // − SUM(CASE WHEN type='EXPENSE' OR (type='TRANSFER' AND is_outgoing=1)
    //            THEN amount ELSE 0 END)
    const alaSql = (tx: BalanceInput) => {
      const suma = tx.type === "INCOME" || (tx.type === "TRANSFER" && !tx.isOutgoing);
      const resta = tx.type === "EXPENSE" || (tx.type === "TRANSFER" && tx.isOutgoing);
      return (suma ? tx.amount : 0) - (resta ? tx.amount : 0);
    };

    const casos: BalanceInput[] = [ingreso(100), gasto(40), sale(50), entra(50)];
    for (const tx of casos) {
      expect(transactionDelta(tx)).toBe(alaSql(tx));
    }
  });
});
