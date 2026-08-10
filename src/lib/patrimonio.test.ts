import { describe, expect, it } from "vitest";

import {
  type PatrimonioInput,
  desglosarDisponibleReal,
  summarizeNetWorth,
} from "./patrimonio.ts";

const cuenta = (
  currentBalance: number,
  bufferAmount = 0,
  { includeInTotal = true, bufferApplied = true } = {},
): PatrimonioInput => ({
  type: "BANK",
  currentBalance,
  creditLimit: null,
  bufferAmount,
  bufferApplied,
  includeInTotal,
});

const tarjeta = (
  currentBalance: number,
  { includeInTotal = true, creditLimit = 1000 } = {},
): PatrimonioInput => ({
  type: "CREDIT_CARD",
  currentBalance,
  creditLimit,
  bufferAmount: 0,
  bufferApplied: true,
  includeInTotal,
});

describe("el caso real del usuario", () => {
  // Activos 398.05, colchones 200.00, deuda de tarjetas 1503.13.
  const suyas = [cuenta(398.05, 200), tarjeta(-1503.13)];

  it("el disponible real resta también la deuda de las tarjetas", () => {
    const p = summarizeNetWorth(suyas);

    expect(p.assets).toBeCloseTo(398.05, 2);
    expect(p.reserved).toBeCloseTo(200, 2);
    expect(p.cardDebt).toBeCloseTo(1503.13, 2);
    // 398.05 − 200.00 − 1503.13
    expect(p.realAvailable).toBeCloseTo(-1305.08, 2);
  });

  it("y sigue diciendo cuánto se puede gastar hoy sin tocar el colchón", () => {
    // Los 198.05 de antes no se pierden: son otra pregunta.
    expect(summarizeNetWorth(suyas).spendableToday).toBeCloseTo(198.05, 2);
  });
});

describe("summarizeNetWorth", () => {
  it("sin tarjetas, el disponible real es lo gastable de hoy", () => {
    const p = summarizeNetWorth([cuenta(1000, 300)]);

    expect(p.cardDebt).toBe(0);
    expect(p.hasCardDebt).toBe(false);
    expect(p.spendableToday).toBe(700);
    expect(p.realAvailable).toBe(700);
  });

  it("sin colchones, solo resta la deuda", () => {
    const p = summarizeNetWorth([cuenta(1000), tarjeta(-400)]);

    expect(p.hasAnyBuffer).toBe(false);
    expect(p.spendableToday).toBe(1000);
    expect(p.realAvailable).toBe(600);
  });

  it("sin nada de nada, todo a cero", () => {
    const p = summarizeNetWorth([]);
    expect(p.realAvailable).toBe(0);
    expect(p.hasAnyBuffer).toBe(false);
    expect(p.hasCardDebt).toBe(false);
  });

  it("un saldo a favor en la tarjeta no cuenta como deuda negativa", () => {
    const p = summarizeNetWorth([cuenta(500), tarjeta(120)]);
    expect(p.cardDebt).toBe(0);
    expect(p.realAvailable).toBe(500);
  });

  it("una cuenta excluida del total no suma nada", () => {
    const p = summarizeNetWorth([
      cuenta(1000),
      cuenta(9999, 500, { includeInTotal: false }),
    ]);

    expect(p.assets).toBe(1000);
    expect(p.reserved).toBe(0);
  });

  it("una TARJETA excluida del total tampoco suma deuda", () => {
    // La regla de `includeInTotal` tiene que significar lo mismo en los dos
    // tipos de cuenta: si la deuda contase pero el saldo no, el flag querría
    // decir cosas distintas según dónde se ponga.
    const p = summarizeNetWorth([cuenta(1000), tarjeta(-800, { includeInTotal: false })]);

    expect(p.cardDebt).toBe(0);
    expect(p.realAvailable).toBe(1000);
  });

  it("el colchón apagado no descuenta, pero la deuda sí", () => {
    const p = summarizeNetWorth([
      cuenta(1000, 300, { bufferApplied: false }),
      tarjeta(-200),
    ]);

    expect(p.reserved).toBe(0);
    expect(p.spendableToday).toBe(1000);
    expect(p.realAvailable).toBe(800);
  });

  it("`net` no descuenta colchones: ese dinero sigue siendo tuyo", () => {
    const p = summarizeNetWorth([cuenta(1000, 300), tarjeta(-400)]);

    expect(p.net).toBe(600); // 1000 − 400
    expect(p.realAvailable).toBe(300); // 1000 − 300 − 400
  });
});

describe("desglose", () => {
  it("enseña de dónde sale el número", () => {
    const p = summarizeNetWorth([cuenta(398.05, 200), tarjeta(-1503.13)]);
    const lineas = desglosarDisponibleReal(p);

    expect(lineas.map((l) => l.etiqueta)).toEqual([
      "Activos",
      "Colchones",
      "Deuda de tarjetas",
      "Disponible real",
    ]);
    expect(lineas.at(-1)!.importe).toBeCloseTo(-1305.08, 2);

    // Y cuadra: activos − colchones − deuda = resultado.
    const [activos, colchones, deuda, resultado] = lineas;
    expect(activos!.importe - colchones!.importe - deuda!.importe).toBeCloseTo(
      resultado!.importe,
      2,
    );
  });

  it("no mete líneas de cero para quien no usa colchones ni tarjetas", () => {
    const lineas = desglosarDisponibleReal(summarizeNetWorth([cuenta(500)]));
    expect(lineas.map((l) => l.etiqueta)).toEqual(["Activos", "Disponible real"]);
  });
});
