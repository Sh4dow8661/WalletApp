import type { AccountType, BudgetRecurrence, CategoryType } from "@/shared/constants.ts";

import { currentPeriod } from "../budget-period.ts";
import { normalizeForMatching } from "./types.ts";

/**
 * Sugiere CUENTA, CATEGORÍA y PRESUPUESTOS para un recibo, con reglas locales.
 * Sin IA y sin red. Portado de `domain/receipt/ReceiptCategorizer.kt`.
 *
 * Los tipos de entrada son mínimos y estructurales a propósito: al categorizer
 * solo le hace falta un puñado de campos, así que sirve tanto para las filas de
 * la base como para los DTOs del API.
 */

export interface CategoryLike {
  id: string;
  name: string;
  type: CategoryType;
}

export interface AccountLike {
  id: string;
  type: AccountType;
}

export interface BudgetLike {
  id: string;
  name: string;
  startDate: number;
  endDate: number;
  recurrence: BudgetRecurrence;
}

export interface Suggestion {
  categoryId: string | null;
  accountId: string | null;
  budgetIds: string[];
}

/** Categoría a la que se cae si nada coincide. */
export const FALLBACK_CATEGORY_NAME = "Otros";

/**
 * Diccionario ordenado tienda → categoría.
 *
 * **El orden importa**: gana la primera categoría con coincidencia, así que las
 * específicas van antes que las genéricas. Por eso "OXXO GAS" (Transporte) está
 * por delante de "OXXO" (Comida).
 *
 * La clave es el nombre canónico de la categoría, tal como aparece en
 * `DefaultData`. Para ampliarlo basta con añadir palabras a la lista.
 */
export const MERCHANT_KEYWORDS: readonly (readonly [string, readonly string[]])[] = [
  [
    "Transporte",
    [
      // Se evitan palabras muy cortas como "ado" (ADO) porque casan con el
      // sufijo -ado de muchas otras (MERCADO, PESCADO, SUMINISTRADOR…).
      "oxxo gas",
      "pemex",
      "gasolin",
      "combustible",
      "shell",
      "mobil",
      "repsol",
      "uber",
      "didi",
      "cabify",
      "taxi",
      "estacionamiento",
      "parking",
      "caseta",
      "peaje",
      "autobus",
    ],
  ],
  [
    "Salud",
    [
      "farmacia",
      "farmacias",
      "benavides",
      "similares",
      "hospital",
      "clinica",
      "medico",
      "dentista",
      "laboratorio",
      "optica",
      "gimnasio",
      "gym",
    ],
  ],
  [
    "Servicios",
    [
      "cfe",
      "telmex",
      "telcel",
      "movistar",
      "att",
      "izzi",
      "totalplay",
      "megacable",
      "dish",
      "recarga",
      "recibo de luz",
      "predial",
    ],
  ],
  [
    "Entretenimiento",
    [
      "cinepolis",
      "cinemex",
      "cinema",
      "netflix",
      "spotify",
      "hbo",
      "disney",
      "steam",
      "playstation",
      "xbox",
      "nintendo",
      "teatro",
    ],
  ],
  [
    "Educación",
    [
      "libreria",
      "papeleria",
      "universidad",
      "colegio",
      "escuela",
      "instituto",
      "gandhi",
      "porrua",
    ],
  ],
  [
    "Vivienda",
    ["home depot", "ferreteria", "construrama", "truper", "muebleria", "muebles", "ikea"],
  ],
  [
    "Compras",
    [
      "liverpool",
      "palacio",
      "coppel",
      "elektra",
      "sears",
      "suburbia",
      "zara",
      "bershka",
      "amazon",
      "mercado libre",
      "mercadolibre",
      "shein",
      "best buy",
      "office depot",
    ],
  ],
  [
    "Comida",
    [
      // Supermercados y tiendas de conveniencia
      "walmart",
      "soriana",
      "bodega aurrera",
      "aurrera",
      "chedraui",
      "heb",
      "h-e-b",
      "costco",
      "sams",
      "superama",
      "la comer",
      "comercial mexicana",
      "supermercado",
      "abarrotes",
      "oxxo",
      "7-eleven",
      "seven eleven",
      "kiosko",
      "circle k",
      "fruteria",
      "carniceria",
      "panaderia",
      "tortilleria",
      // Restaurantes y cafeterías
      "restaurante",
      "taqueria",
      "tacos",
      "pizza",
      "dominos",
      "little caesars",
      "burger",
      "mcdonald",
      "kfc",
      "subway",
      "starbucks",
      "cafe",
      "coffee",
      "vips",
      "toks",
      "sushi",
      "cocina",
      "fonda",
      "marisco",
      "cantina",
    ],
  ],
];

/** Sugiere categoría, cuenta y presupuestos de una sola vez. */
export function categorize(options: {
  merchant: string | null;
  date: number;
  categories: readonly CategoryLike[];
  accounts: readonly AccountLike[];
  budgets: readonly BudgetLike[];
  preferredAccountId?: string | null;
  lastUsedAccountId?: string | null;
  timeZone: string;
}): Suggestion {
  const category = suggestCategory(options.merchant, options.categories);
  const account = suggestAccount(
    options.accounts,
    options.preferredAccountId ?? null,
    options.lastUsedAccountId ?? null,
  );
  const budgetIds = suggestBudgets(
    options.budgets,
    options.date,
    category,
    options.merchant,
    options.timeZone,
  );

  return {
    categoryId: category?.id ?? null,
    accountId: account?.id ?? null,
    budgetIds,
  };
}

// --- CATEGORÍA -------------------------------------------------------------

export function suggestCategory(
  merchant: string | null,
  categories: readonly CategoryLike[],
): CategoryLike | null {
  const expense = categories.filter((c) => c.type === "EXPENSE");
  if (expense.length === 0) return null;

  const normMerchant = merchant ? normalizeForMatching(merchant) : "";
  if (normMerchant !== "") {
    // 1) Diccionario tienda → categoría. Gana la primera coincidencia.
    for (const [categoryName, keywords] of MERCHANT_KEYWORDS) {
      if (keywords.some((k) => normMerchant.includes(normalizeForMatching(k)))) {
        const encontrada = findByName(expense, categoryName);
        if (encontrada) return encontrada;
      }
    }
    // 2) El nombre de una categoría aparece dentro del de la tienda.
    const porNombre = expense.find((c) =>
      normMerchant.includes(normalizeForMatching(c.name)),
    );
    if (porNombre) return porNombre;
  }

  // 3) "Otros", o la primera categoría de gasto que haya.
  return findByName(expense, FALLBACK_CATEGORY_NAME) ?? expense[0]!;
}

function findByName(
  categories: readonly CategoryLike[],
  name: string,
): CategoryLike | null {
  const target = normalizeForMatching(name);
  return categories.find((c) => normalizeForMatching(c.name) === target) ?? null;
}

// --- CUENTA ----------------------------------------------------------------

/**
 * Regla simple y predecible: la cuenta preferida de escaneos, si no la última
 * usada en un gasto, si no la primera en efectivo, y si tampoco, la primera.
 *
 * Los identificadores que no correspondan a ninguna cuenta se ignoran en vez de
 * fallar: pueden apuntar a una cuenta ya borrada.
 */
export function suggestAccount(
  accounts: readonly AccountLike[],
  preferredAccountId: string | null,
  lastUsedAccountId: string | null,
): AccountLike | null {
  if (accounts.length === 0) return null;

  const preferida = preferredAccountId
    ? accounts.find((a) => a.id === preferredAccountId)
    : undefined;
  if (preferida) return preferida;

  const ultima = lastUsedAccountId
    ? accounts.find((a) => a.id === lastUsedAccountId)
    : undefined;
  if (ultima) return ultima;

  return accounts.find((a) => a.type === "CASH") ?? accounts[0]!;
}

// --- PRESUPUESTOS ----------------------------------------------------------

/**
 * Preselecciona los presupuestos cuyo período cubre la fecha del ticket y cuyo
 * nombre encaja con la categoría sugerida o con la tienda. Si nada coincide, no
 * marca ninguno: siempre se puede ajustar a mano antes de guardar.
 */
export function suggestBudgets(
  budgets: readonly BudgetLike[],
  date: number,
  category: CategoryLike | null,
  merchant: string | null,
  timeZone: string,
): string[] {
  if (budgets.length === 0) return [];

  const normCategory = category ? normalizeForMatching(category.name) : null;
  const normMerchant = merchant ? normalizeForMatching(merchant) : null;

  return budgets
    .filter((budget) => {
      if (!periodCovers(budget, date, timeZone)) return false;

      const budgetName = normalizeForMatching(budget.name);
      if (budgetName === "") return false;

      const matchesCategory =
        normCategory !== null &&
        (budgetName.includes(normCategory) || normCategory.includes(budgetName));
      const matchesMerchant =
        normMerchant !== null &&
        normMerchant !== "" &&
        (normMerchant.includes(budgetName) || budgetName.includes(normMerchant));

      return matchesCategory || matchesMerchant;
    })
    .map((b) => b.id);
}

function periodCovers(budget: BudgetLike, date: number, timeZone: string): boolean {
  // Se pregunta por el período que contiene la fecha del ticket, no el de hoy.
  const { start, end } = currentPeriod(
    budget.startDate,
    budget.endDate,
    budget.recurrence,
    date,
    timeZone,
  );
  return date >= start && date <= end;
}
