import { describe, expect, it } from "vitest";

import { zonedTime } from "../dates.ts";
import {
  type AccountLike,
  type BudgetLike,
  type CategoryLike,
  categorize,
  suggestAccount,
  suggestBudgets,
  suggestCategory,
} from "./categorizer.ts";

/**
 * Portado de `ReceiptCategorizerTest.kt`. Los identificadores pasan de Long a
 * texto (§7), pero los casos y los datos son los mismos.
 */

const PR = "America/Puerto_Rico";

const cat = (
  id: string,
  name: string,
  type: CategoryLike["type"] = "EXPENSE",
): CategoryLike => ({
  id,
  name,
  type,
});

// Mismos nombres que DefaultData.
const categories: CategoryLike[] = [
  cat("cat-1", "Comida"),
  cat("cat-2", "Transporte"),
  cat("cat-3", "Vivienda"),
  cat("cat-4", "Entretenimiento"),
  cat("cat-5", "Salud"),
  cat("cat-6", "Compras"),
  cat("cat-7", "Educación"),
  cat("cat-8", "Servicios"),
  cat("cat-9", "Otros"),
  cat("cat-10", "Salario", "INCOME"), // debe ignorarse
];

const idOf = (name: string) => categories.find((c) => c.name === name)!.id;

const account = (id: string, type: AccountLike["type"]): AccountLike => ({ id, type });

const accounts: AccountLike[] = [account("acc-1", "CASH"), account("acc-2", "BANK")];

const fecha = (year: number, month: number, day: number) =>
  zonedTime({ year, month, day }, PR);

const budget = (id: string, name: string, start: number, end: number): BudgetLike => ({
  id,
  name,
  startDate: start,
  endDate: end,
  recurrence: "NONE",
});

describe("categoría", () => {
  it("mapea supermercados y restaurantes a Comida", () => {
    expect(suggestCategory("WALMART SUPERCENTER", categories)?.id).toBe(idOf("Comida"));
    expect(suggestCategory("STARBUCKS COFFEE", categories)?.id).toBe(idOf("Comida"));
    expect(suggestCategory("OXXO", categories)?.id).toBe(idOf("Comida"));
  });

  it("mapea gasolineras a Transporte y prioriza OXXO GAS sobre OXXO", () => {
    // El orden del diccionario es lo que hace que "OXXO GAS" no acabe en Comida.
    expect(suggestCategory("PEMEX E12345", categories)?.id).toBe(idOf("Transporte"));
    expect(suggestCategory("OXXO GAS AV REFORMA", categories)?.id).toBe(
      idOf("Transporte"),
    );
  });

  it("mapea otras tiendas conocidas a su categoría", () => {
    expect(suggestCategory("FARMACIA GUADALAJARA", categories)?.id).toBe(idOf("Salud"));
    expect(suggestCategory("CINEPOLIS PLAZA", categories)?.id).toBe(
      idOf("Entretenimiento"),
    );
    expect(suggestCategory("LIVERPOOL CENTRO", categories)?.id).toBe(idOf("Compras"));
    expect(suggestCategory("THE HOME DEPOT", categories)?.id).toBe(idOf("Vivienda"));
    expect(suggestCategory("LIBRERIA GANDHI", categories)?.id).toBe(idOf("Educación"));
    expect(suggestCategory("CFE SUMINISTRADOR", categories)?.id).toBe(idOf("Servicios"));
  });

  it("una tienda desconocida o nula cae en Otros", () => {
    expect(suggestCategory("TIENDA DESCONOCIDA XYZ", categories)?.id).toBe(idOf("Otros"));
    expect(suggestCategory(null, categories)?.id).toBe(idOf("Otros"));
  });

  it("solo considera categorías de gasto", () => {
    expect(suggestCategory("WALMART", categories)?.type).toBe("EXPENSE");
  });

  it("ignora acentos y mayúsculas al comparar", () => {
    // `normalizeForMatching` descompone en NFD y borra las tildes.
    expect(suggestCategory("libreria gandhi", categories)?.id).toBe(idOf("Educación"));
    expect(suggestCategory("LIBRERÍA GANDHI", categories)?.id).toBe(idOf("Educación"));
  });

  it("empareja por el nombre de la categoría si no hay palabra clave", () => {
    // Segunda pasada: el nombre real de una categoría dentro del de la tienda.
    expect(suggestCategory("CENTRO DE SALUD MUNICIPAL", categories)?.id).toBe(
      idOf("Salud"),
    );
  });

  it("sin categorías de gasto no sugiere ninguna", () => {
    expect(suggestCategory("WALMART", [cat("cat-10", "Salario", "INCOME")])).toBeNull();
  });

  it("sin categoría Otros cae en la primera de gasto", () => {
    const sinOtros = [cat("cat-1", "Comida"), cat("cat-2", "Transporte")];
    expect(suggestCategory("DESCONOCIDA", sinOtros)?.id).toBe("cat-1");
  });
});

describe("cuenta", () => {
  it("la cuenta preferida tiene prioridad", () => {
    expect(suggestAccount(accounts, "acc-2", "acc-1")?.id).toBe("acc-2");
  });

  it("sin preferida usa la última cuenta usada", () => {
    expect(suggestAccount(accounts, null, "acc-2")?.id).toBe("acc-2");
  });

  it("sin datos prefiere el efectivo", () => {
    expect(suggestAccount(accounts, null, null)?.id).toBe("acc-1");
  });

  it("sin efectivo cae en la primera cuenta", () => {
    const sinEfectivo = [account("acc-2", "BANK"), account("acc-3", "CREDIT_CARD")];
    expect(suggestAccount(sinEfectivo, null, null)?.id).toBe("acc-2");
  });

  it("los identificadores inexistentes se ignoran y se usa el fallback", () => {
    // Puede pasar si la cuenta preferida se borró después de configurarla.
    expect(suggestAccount(accounts, "acc-99", null)?.id).toBe("acc-1");
  });

  it("sin cuentas no sugiere cuenta", () => {
    expect(suggestAccount([], null, null)).toBeNull();
  });
});

describe("presupuestos", () => {
  it("preselecciona los que cubren la fecha y encajan con la categoría", () => {
    const date = fecha(2024, 3, 15);
    const marzo = budget("b-1", "Comida marzo", fecha(2024, 3, 1), fecha(2024, 3, 31));
    const transporte = budget("b-2", "Transporte", fecha(2024, 3, 1), fecha(2024, 3, 31));
    const abril = budget("b-3", "Comida abril", fecha(2024, 4, 1), fecha(2024, 4, 30));

    const result = suggestBudgets(
      [marzo, transporte, abril],
      date,
      cat("cat-1", "Comida"),
      null,
      PR,
    );

    expect(result).toEqual(["b-1"]);
  });

  it("también preselecciona por coincidencia con la tienda", () => {
    const date = fecha(2024, 3, 15);
    const walmart = budget("b-4", "Walmart", fecha(2024, 3, 1), fecha(2024, 3, 31));

    const result = suggestBudgets(
      [walmart],
      date,
      cat("cat-2", "Transporte"),
      "WALMART SUPERCENTER",
      PR,
    );

    expect(result).toEqual(["b-4"]);
  });

  it("sin coincidencias no preselecciona ninguno", () => {
    const date = fecha(2024, 3, 15);
    const otro = budget("b-5", "Vacaciones", fecha(2024, 3, 1), fecha(2024, 3, 31));
    expect(suggestBudgets([otro], date, cat("cat-1", "Comida"), "OXXO", PR)).toEqual([]);
  });

  it("sin presupuestos devuelve lista vacía", () => {
    expect(
      suggestBudgets([], fecha(2024, 3, 15), cat("cat-1", "Comida"), null, PR),
    ).toEqual([]);
  });

  it("usa el período que contiene la fecha del ticket, no el de hoy", () => {
    // Un presupuesto mensual recurrente: el ticket es de marzo de 2024, mucho
    // antes de hoy, y aun así tiene que reconocerse su período.
    const mensual: BudgetLike = {
      id: "b-6",
      name: "Comida",
      startDate: fecha(2024, 1, 5),
      endDate: fecha(2024, 2, 4),
      recurrence: "MONTHLY",
    };
    const result = suggestBudgets(
      [mensual],
      fecha(2024, 3, 15),
      cat("cat-1", "Comida"),
      null,
      PR,
    );
    expect(result).toEqual(["b-6"]);
  });
});

describe("categorize", () => {
  it("combina cuenta, categoría y presupuestos", () => {
    const date = fecha(2024, 3, 15);
    const budgets = [
      budget("b-1", "Comida marzo", fecha(2024, 3, 1), fecha(2024, 3, 31)),
    ];

    const suggestion = categorize({
      merchant: "WALMART SUPERCENTER",
      date,
      categories,
      accounts,
      budgets,
      preferredAccountId: null,
      lastUsedAccountId: "acc-2",
      timeZone: PR,
    });

    expect(suggestion.categoryId).toBe(idOf("Comida"));
    expect(suggestion.accountId).toBe("acc-2");
    expect(suggestion.budgetIds).toEqual(["b-1"]);
  });

  it("devuelve nulos cuando no hay nada que sugerir", () => {
    const suggestion = categorize({
      merchant: null,
      date: fecha(2024, 3, 15),
      categories: [],
      accounts: [],
      budgets: [],
      timeZone: PR,
    });

    expect(suggestion.categoryId).toBeNull();
    expect(suggestion.accountId).toBeNull();
    expect(suggestion.budgetIds).toEqual([]);
  });
});
