import { describe, expect, it } from "vitest";

import { totalBalance, transactionDelta } from "./balance.ts";
import {
  type CreditInput,
  cardDebt,
  cardUtilization,
  creditLevel,
  summarizeAccounts,
} from "./credit.ts";

const tarjeta = (
  currentBalance: number,
  creditLimit: number | null,
  includeInTotal = true,
): CreditInput => ({
  type: "CREDIT_CARD",
  currentBalance,
  creditLimit,
  includeInTotal,
});

const cuenta = (currentBalance: number, includeInTotal = true): CreditInput => ({
  type: "BANK",
  currentBalance,
  creditLimit: null,
  includeInTotal,
});

describe("convención de signos", () => {
  it("gastar con la tarjeta la deja en negativo, y eso es la deuda", () => {
    // Este test ata `credit.ts` a `balance.ts`: si alguien cambiara el signo de
    // un EXPENSE, la deuda pasaría a calcularse al revés y esto fallaría.
    const gasto = transactionDelta({ amount: 250, type: "EXPENSE", isOutgoing: false });
    expect(gasto).toBe(-250);
    expect(cardDebt(tarjeta(gasto, 1000))).toBe(250);
  });

  it("un saldo a favor en la tarjeta no es deuda negativa, es deuda cero", () => {
    expect(cardDebt(tarjeta(75, 1000))).toBe(0);
    expect(cardUtilization(tarjeta(75, 1000)).percent).toBe(0);
  });

  it("una cuenta normal en negativo no cuenta como deuda de tarjeta", () => {
    expect(cardDebt(cuenta(-500))).toBe(0);
  });
});

describe("cardUtilization", () => {
  it("calcula el porcentaje sobre el límite", () => {
    expect(cardUtilization(tarjeta(-250, 1000)).percent).toBe(25);
    expect(cardUtilization(tarjeta(-1000, 1000)).percent).toBe(100);
  });

  it("sin límite configurado no inventa un porcentaje", () => {
    const sinLimite = cardUtilization(tarjeta(-300, null));
    expect(sinLimite.percent).toBeNull();
    expect(sinLimite.level).toBeNull();
    expect(sinLimite.available).toBeNull();
    // La deuda sí se conoce aunque falte el límite.
    expect(sinLimite.debt).toBe(300);
  });

  it("trata un límite de 0 igual que no tenerlo, en vez de dividir por cero", () => {
    expect(cardUtilization(tarjeta(-300, 0)).percent).toBeNull();
    expect(cardUtilization(tarjeta(-300, -50)).percent).toBeNull();
  });

  it("deuda cero da 0 % y todo el límite disponible", () => {
    const limpia = cardUtilization(tarjeta(0, 1500));
    expect(limpia.percent).toBe(0);
    expect(limpia.level).toBe("excelente");
    expect(limpia.available).toBe(1500);
    expect(limpia.isOverLimit).toBe(false);
  });

  it("con sobregiro pasa del 100 % y no deja disponible negativo", () => {
    const pasada = cardUtilization(tarjeta(-1200, 1000));
    expect(pasada.percent).toBe(120);
    expect(pasada.level).toBe("critico");
    expect(pasada.available).toBe(0);
    expect(pasada.isOverLimit).toBe(true);
  });
});

describe("creditLevel", () => {
  it("respeta los cortes en 10, 30, 50 y 80", () => {
    expect(creditLevel(0)).toBe("excelente");
    expect(creditLevel(9)).toBe("excelente");
    expect(creditLevel(10)).toBe("bien");
    expect(creditLevel(29)).toBe("bien");
    expect(creditLevel(30)).toBe("aviso");
    expect(creditLevel(49)).toBe("aviso");
    expect(creditLevel(50)).toBe("malo");
    expect(creditLevel(79)).toBe("malo");
    expect(creditLevel(80)).toBe("critico");
    expect(creditLevel(200)).toBe("critico");
  });

  it("el nivel se decide sobre el mismo número que se muestra", () => {
    // 29,6 % se enseña como «30 %»: el nivel tiene que ser el de 30, o el color
    // diría «bien» junto a un número que ya está sobre el umbral.
    const casi = cardUtilization(tarjeta(-296, 1000));
    expect(casi.percent).toBe(30);
    expect(casi.level).toBe("aviso");
  });
});

describe("summarizeAccounts", () => {
  it("separa activos de deuda en vez de mezclarlos", () => {
    const resumen = summarizeAccounts([cuenta(1000), cuenta(500), tarjeta(-300, 1000)]);

    expect(resumen.assets).toBe(1500);
    expect(resumen.debt).toBe(300);
    expect(resumen.net).toBe(1200);
  });

  it("agrega sobre la suma de deudas y de límites, no promediando porcentajes", () => {
    // Una tarjeta grande al 50 % y una pequeña al 0 %: el agregado es 49,5 %
    // (redondeado a 50), no la media de 50 y 0.
    const resumen = summarizeAccounts([tarjeta(-5000, 10_000), tarjeta(0, 100)]);

    expect(resumen.totalPercent).toBe(50);
    expect(resumen.totalLimit).toBe(10_100);
    expect(resumen.totalLevel).toBe("malo");
  });

  it("deja fuera del porcentaje las tarjetas sin límite, pero cuenta su deuda", () => {
    const resumen = summarizeAccounts([tarjeta(-200, 1000), tarjeta(-800, null)]);

    // El porcentaje solo mide lo que tiene límite contra el que compararse.
    expect(resumen.totalPercent).toBe(20);
    expect(resumen.cardsWithoutLimit).toBe(1);
    // La deuda total sí las incluye a las dos.
    expect(resumen.debt).toBe(1000);
  });

  it("sin ninguna tarjeta con límite no hay porcentaje agregado", () => {
    const resumen = summarizeAccounts([cuenta(100), tarjeta(-50, null)]);
    expect(resumen.totalPercent).toBeNull();
    expect(resumen.totalLevel).toBeNull();
    expect(resumen.totalLimit).toBeNull();
  });

  it("respeta includeInTotal, igual que el balance total del dashboard", () => {
    const resumen = summarizeAccounts([
      cuenta(1000),
      cuenta(999, false),
      tarjeta(-300, 1000, false),
    ]);

    expect(resumen.assets).toBe(1000);
    expect(resumen.debt).toBe(0);
    expect(resumen.totalPercent).toBeNull();
  });

  it("el neto coincide con el balance total que ya calculaba el servidor", () => {
    // Propiedad importante: `net` no es una cifra nueva que pueda contradecir
    // al dashboard, es la misma suma vista de otra forma. Si alguien cambiara
    // el signo de la deuda, las dos pantallas empezarían a discrepar y este
    // test lo cazaría.
    const cuentas = [cuenta(154.1), cuenta(1300), tarjeta(0, null), tarjeta(-420, 1000)];

    const resumen = summarizeAccounts(cuentas);
    const total = totalBalance(cuentas);

    expect(resumen.net).toBeCloseTo(total, 10);
    expect(resumen.net).toBeCloseTo(1034.1, 10);
  });

  it("sin cuentas devuelve todo a cero sin romperse", () => {
    const resumen = summarizeAccounts([]);
    expect(resumen.assets).toBe(0);
    expect(resumen.debt).toBe(0);
    expect(resumen.net).toBe(0);
    expect(resumen.totalPercent).toBeNull();
  });
});
