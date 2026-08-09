import { describe, expect, it } from "vitest";

import { SUPPORTED_CURRENCIES } from "@/shared/constants.ts";

import {
  formatAmount,
  formatMoney,
  formatSignedMoney,
  parseAmountInput,
  roundToCents,
} from "./money.ts";

/**
 * `formatMoney` delega en `Intl.NumberFormat`, así que el símbolo y la
 * colocación exactos dependen del ICU del runtime. Los tests comprueban lo que
 * de verdad importa y es estable: que aparezca la cantidad, que el signo sea el
 * correcto y que ninguna moneda admitida reviente.
 */

describe("formatMoney", () => {
  it("incluye la cantidad con dos decimales", () => {
    const s = formatMoney(1234.5, "USD");
    expect(s).toMatch(/1[.,]234[.,]50/);
  });

  it("formatea todas las monedas admitidas sin lanzar", () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(() => formatMoney(1234.56, currency), currency).not.toThrow();
      expect(formatMoney(1234.56, currency), currency).toMatch(/\d/);
    }
  });

  it("cae a CÓDIGO importe si la moneda no se reconoce", () => {
    // Mismo comportamiento que el catch del CurrencyFormatter original: más vale
    // enseñar el número que romper la pantalla.
    expect(formatMoney(12.3, "NOEXISTE")).toBe("NOEXISTE 12.30");
  });

  it("formatea el cero y los negativos", () => {
    expect(formatMoney(0, "USD")).toMatch(/0[.,]00/);
    expect(formatMoney(-50, "USD")).toMatch(/50[.,]00/);
  });
});

describe("formatSignedMoney (§8.7)", () => {
  it("antepone - a los gastos y + a los ingresos", () => {
    expect(formatSignedMoney(25.5, true, "USD")).toMatch(/^-/);
    expect(formatSignedMoney(25.5, false, "USD")).toMatch(/^\+/);
  });

  it("usa el valor absoluto, así que un importe negativo no duplica el signo", () => {
    const s = formatSignedMoney(-25.5, true, "USD");
    expect(s).toMatch(/^-/);
    expect(s.slice(1)).not.toContain("-");
  });

  it("usa el guion ASCII, igual que la app Android", () => {
    // Paridad exacta con `CurrencyFormatter.formatSigned`, que usa "-" y no "−".
    expect(formatSignedMoney(10, true, "USD").charCodeAt(0)).toBe(45);
  });
});

describe("formatAmount", () => {
  it("da dos decimales sin símbolo de moneda", () => {
    expect(formatAmount(1234.5)).toMatch(/^1[.,]234[.,]50$/);
  });
});

describe("parseAmountInput", () => {
  it("lee el formato con punto decimal", () => {
    expect(parseAmountInput("1234.56")).toBeCloseTo(1234.56, 10);
    expect(parseAmountInput("1,234.56")).toBeCloseTo(1234.56, 10);
  });

  it("lee el formato con coma decimal", () => {
    expect(parseAmountInput("1234,56")).toBeCloseTo(1234.56, 10);
    expect(parseAmountInput("1.234,56")).toBeCloseTo(1234.56, 10);
  });

  it("distingue miles de decimales por las cifras que siguen", () => {
    expect(parseAmountInput("1,234")).toBe(1234);
    expect(parseAmountInput("1.234")).toBe(1234);
    expect(parseAmountInput("12,50")).toBeCloseTo(12.5, 10);
  });

  it("ignora símbolos y espacios", () => {
    expect(parseAmountInput("$ 1,234.56 ")).toBeCloseTo(1234.56, 10);
  });

  it("distingue campo vacío de cero", () => {
    // El llamador necesita saber si el usuario no escribió nada o escribió 0.
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("   ")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
    expect(parseAmountInput("$")).toBeNull();
    expect(parseAmountInput("0")).toBe(0);
  });

  it("conserva el signo negativo", () => {
    expect(parseAmountInput("-25.50")).toBeCloseTo(-25.5, 10);
  });

  it("interpreta un decimal sin parte entera", () => {
    expect(parseAmountInput(".50")).toBeCloseTo(0.5, 10);
    expect(parseAmountInput(",50")).toBeCloseTo(0.5, 10);
  });
});

describe("roundToCents", () => {
  it("corrige el error clásico de la coma flotante", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // el problema
    expect(roundToCents(0.1 + 0.2)).toBe(0.3); // la corrección
  });

  it("redondea al céntimo más próximo", () => {
    expect(roundToCents(10.005)).toBe(10.01);
    expect(roundToCents(10.004)).toBe(10.0);
  });

  it("no toca lo que ya está redondeado", () => {
    expect(roundToCents(25.5)).toBe(25.5);
    expect(roundToCents(0)).toBe(0);
  });
});
