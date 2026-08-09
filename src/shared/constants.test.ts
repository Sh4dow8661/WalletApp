import { describe, expect, it } from "vitest";

import {
  ACCOUNT_TYPES,
  BUDGET_RECURRENCES,
  BUDGET_RECURRENCE_LABELS,
  CATEGORY_PALETTE,
  DEFAULT_ACCOUNT_ICON,
  DEFAULT_TIME_ZONE,
  FALLBACK_ICON,
  ICON_NAMES,
  SUPPORTED_CURRENCIES,
  TRANSACTION_TYPES,
} from "./constants.ts";

/**
 * Estas constantes se persisten: los iconos por nombre y los colores por hex.
 * Si alguna cambia, los datos ya guardados dejan de resolverse. Los valores
 * esperados están copiados de la app Android, no de constants.ts, para que el
 * test detecte una edición accidental en vez de validarse contra sí mismo.
 */
describe("constantes portadas de la app Android", () => {
  it("mantiene las 20 monedas de CurrencyFormatter en su orden", () => {
    expect(SUPPORTED_CURRENCIES).toEqual([
      "USD",
      "EUR",
      "GBP",
      "JPY",
      "MXN",
      "ARS",
      "COP",
      "CLP",
      "PEN",
      "BRL",
      "CAD",
      "AUD",
      "CHF",
      "CNY",
      "INR",
      "KRW",
      "RUB",
      "TRY",
      "ZAR",
      "NOK",
    ]);
  });

  it("mantiene los 17 nombres de icono de IconMapper.options", () => {
    expect(ICON_NAMES).toEqual([
      "Restaurant",
      "DirectionsCar",
      "Home",
      "Movie",
      "LocalHospital",
      "ShoppingCart",
      "School",
      "Lightbulb",
      "Category",
      "Work",
      "Computer",
      "CardGiftcard",
      "TrendingUp",
      "AttachMoney",
      "Payments",
      "AccountBalance",
      "CreditCard",
    ]);
  });

  it("cae en Category cuando el nombre de icono no se reconoce", () => {
    // IconMapper.iconFor tiene `else -> Icons.Default.Category`.
    expect(FALLBACK_ICON).toBe("Category");
    expect(ICON_NAMES).toContain(FALLBACK_ICON);
  });

  it("mantiene los 15 colores de CategoryPalette en su orden", () => {
    expect(CATEGORY_PALETTE).toEqual([
      "#FF7043",
      "#42A5F5",
      "#8D6E63",
      "#AB47BC",
      "#EF5350",
      "#EC407A",
      "#5C6BC0",
      "#FFA726",
      "#66BB6A",
      "#26A69A",
      "#29B6F6",
      "#9CCC65",
      "#78909C",
      "#D4E157",
      "#FF8A65",
    ]);
  });

  it("usa hex de 6 dígitos en mayúsculas en toda la paleta", () => {
    // Los colores se guardan como texto y se comparan con los del CSV/JSON
    // importado; mezclar mayúsculas y minúsculas rompería la comparación.
    for (const color of CATEGORY_PALETTE) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("mantiene los enums que van en los CHECK de D1", () => {
    expect(ACCOUNT_TYPES).toEqual(["CASH", "BANK", "CREDIT_CARD"]);
    expect(TRANSACTION_TYPES).toEqual(["INCOME", "EXPENSE", "TRANSFER"]);
    expect(BUDGET_RECURRENCES).toEqual(["NONE", "WEEKLY", "BIWEEKLY", "MONTHLY"]);
  });

  it("etiqueta cada recurrencia igual que BudgetRecurrence en Kotlin", () => {
    expect(BUDGET_RECURRENCE_LABELS).toEqual({
      NONE: "Una vez",
      WEEKLY: "Semanal",
      BIWEEKLY: "Quincenal",
      MONTHLY: "Mensual",
    });
    // Ninguna recurrencia puede quedarse sin etiqueta.
    for (const r of BUDGET_RECURRENCES) {
      expect(BUDGET_RECURRENCE_LABELS[r]).toBeTruthy();
    }
  });

  it("asigna a cada tipo de cuenta el icono de AddEditAccountViewModel.setType", () => {
    expect(DEFAULT_ACCOUNT_ICON).toEqual({
      CASH: "Payments",
      BANK: "AccountBalance",
      CREDIT_CARD: "CreditCard",
    });
  });

  it("usa una zona horaria que el runtime reconoce y que no tiene horario de verano", () => {
    // Si el nombre IANA fuera inválido, esto lanzaría RangeError.
    const enero = new Intl.DateTimeFormat("es", {
      timeZone: DEFAULT_TIME_ZONE,
      timeZoneName: "shortOffset",
    }).format(new Date(Date.UTC(2026, 0, 15, 12)));
    const julio = new Intl.DateTimeFormat("es", {
      timeZone: DEFAULT_TIME_ZONE,
      timeZoneName: "shortOffset",
    }).format(new Date(Date.UTC(2026, 6, 15, 12)));

    // Sin horario de verano el desplazamiento es el mismo todo el año, así que
    // agrupar por día local no salta una hora en primavera.
    expect(enero.slice(-5)).toBe(julio.slice(-5));
    expect(enero).toContain("GMT-4");
  });
});
