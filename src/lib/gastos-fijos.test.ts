import { describe, expect, it } from "vitest";

import { dateInputToMillis, millisToDateInput } from "./dates.ts";
import {
  type FixedExpenseInput,
  anchorDayFrom,
  daysUntilDue,
  dueStatus,
  SEMANAS_POR_MES,
  SIN_CATEGORIA,
  groupFixedExpensesByCategory,
  monthlyEquivalent,
  nextDueDate,
  sortFixedExpenses,
  summarizeFixedExpenses,
  weeklyEquivalent,
} from "./gastos-fijos.ts";

const TZ = "America/Puerto_Rico";

const dia = (iso: string) => dateInputToMillis(iso, TZ);
const comoIso = (millis: number) => millisToDateInput(millis, TZ);

const gasto = (
  amount: number,
  everyMonths: number,
  nextDue: string,
  isActive = true,
): FixedExpenseInput => ({
  amount,
  everyMonths,
  nextDueDate: dia(nextDue),
  isActive,
});

describe("costo mensual equivalente", () => {
  it("un seguro anual de 600 son 50 al mes", () => {
    expect(monthlyEquivalent(gasto(600, 12, "2026-01-01"))).toBe(50);
  });

  it("un gasto mensual vale lo que el recibo", () => {
    expect(monthlyEquivalent(gasto(45, 1, "2026-01-01"))).toBe(45);
  });

  it("uno semestral es la mitad", () => {
    expect(monthlyEquivalent(gasto(300, 6, "2026-01-01"))).toBe(50);
  });

  it("no redondea: el redondeo es cosa de la pantalla", () => {
    // 100 / 3 = 33,3333… Si se redondease aquí, doce de estos sumarían 399,96
    // en vez de 400 y el total mentiría.
    const tercio = monthlyEquivalent(gasto(100, 3, "2026-01-01"));
    expect(tercio).toBeCloseTo(33.3333333, 6);
    expect(tercio * 12).toBeCloseTo(400, 6);
  });
});

describe("avance del vencimiento", () => {
  it("avanza un mes normal", () => {
    expect(comoIso(nextDueDate(dia("2026-03-15"), 1, 15, TZ))).toBe("2026-04-15");
  });

  it("avanza doce meses en un anual", () => {
    expect(comoIso(nextDueDate(dia("2026-03-15"), 12, 15, TZ))).toBe("2027-03-15");
  });

  it("el día 31 se recorta al último de febrero", () => {
    expect(comoIso(nextDueDate(dia("2026-01-31"), 1, 31, TZ))).toBe("2026-02-28");
  });

  it("en año bisiesto febrero llega al 29", () => {
    // 2028 es bisiesto.
    expect(comoIso(nextDueDate(dia("2028-01-31"), 1, 31, TZ))).toBe("2028-02-29");
  });

  it("tras recortar vuelve al día ancla, no se queda clavado", () => {
    // Este es el fallo que evita guardar `anchor_day`: derivando el día del
    // último vencimiento, tras febrero la serie se quedaría en 28 para siempre.
    const ancla = 31;
    let vencimiento = dia("2026-01-31");
    const serie: string[] = [];

    for (let i = 0; i < 5; i++) {
      vencimiento = nextDueDate(vencimiento, 1, ancla, TZ);
      serie.push(comoIso(vencimiento));
    }

    expect(serie).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ]);
  });

  it("el 29 de febrero de un bisiesto cae al 28 al año siguiente", () => {
    expect(comoIso(nextDueDate(dia("2028-02-29"), 12, 29, TZ))).toBe("2029-02-28");
  });

  it("el ancla sale de la primera fecha que elige el usuario", () => {
    expect(anchorDayFrom(dia("2026-01-31"), TZ)).toBe(31);
    expect(anchorDayFrom(dia("2026-06-05"), TZ)).toBe(5);
  });
});

describe("días hasta el vencimiento", () => {
  const hoy = dia("2026-08-10");

  it("cuenta por días locales completos, no por milisegundos", () => {
    // El vencimiento es hoy a las 00:00 y «ahora» es media tarde: sigue siendo
    // hoy, no «venció hace 14 horas».
    const tarde = hoy + 14 * 60 * 60 * 1000;
    expect(daysUntilDue(dia("2026-08-10"), tarde, TZ)).toBe(0);
    expect(dueStatus(dia("2026-08-10"), tarde, TZ)).toBe("hoy");
  });

  it("distingue vencido, hoy, próximo y normal", () => {
    expect(dueStatus(dia("2026-08-05"), hoy, TZ)).toBe("vencido");
    expect(dueStatus(dia("2026-08-10"), hoy, TZ)).toBe("hoy");
    expect(dueStatus(dia("2026-08-17"), hoy, TZ)).toBe("proximo");
    expect(dueStatus(dia("2026-08-18"), hoy, TZ)).toBe("normal");
  });

  it("el aviso llega justo hasta los 7 días", () => {
    expect(daysUntilDue(dia("2026-08-17"), hoy, TZ)).toBe(7);
    expect(daysUntilDue(dia("2026-08-18"), hoy, TZ)).toBe(8);
  });
});

describe("totales", () => {
  const hoy = dia("2026-08-10");

  it("separa el equivalente mensual de lo que toca pagar este mes", () => {
    const lista = [
      gasto(600, 12, "2026-11-01"), // anual: 50 al mes, no vence en agosto
      gasto(45, 1, "2026-08-20"), // mensual: 45 al mes, sí vence
    ];

    const r = summarizeFixedExpenses(lista, 2026, 8, hoy, TZ);

    expect(r.monthlyEquivalent).toBe(95); // 50 + 45
    expect(r.dueThisMonth).toBe(45); // solo el recibo de agosto
    expect(r.countDueThisMonth).toBe(1);
  });

  it("un mes sin recibos tiene equivalente alto y cero a pagar", () => {
    const r = summarizeFixedExpenses([gasto(600, 12, "2026-11-01")], 2026, 9, hoy, TZ);

    expect(r.monthlyEquivalent).toBe(50);
    expect(r.dueThisMonth).toBe(0);
  });

  it("los inactivos no suman ni avisan", () => {
    const lista = [gasto(100, 1, "2026-08-15"), gasto(999, 1, "2026-08-01", false)];
    const r = summarizeFixedExpenses(lista, 2026, 8, hoy, TZ);

    expect(r.monthlyEquivalent).toBe(100);
    expect(r.dueThisMonth).toBe(100);
    expect(r.overdue).toBe(0);
  });

  it("cuenta vencidos y próximos", () => {
    const lista = [
      gasto(10, 1, "2026-08-01"), // vencido
      gasto(20, 1, "2026-08-12"), // próximo
      gasto(30, 1, "2026-09-30"), // normal
    ];

    const r = summarizeFixedExpenses(lista, 2026, 8, hoy, TZ);
    expect(r.overdue).toBe(1);
    expect(r.dueSoon).toBe(1);
  });

  it("sin gastos devuelve ceros", () => {
    const r = summarizeFixedExpenses([], 2026, 8, hoy, TZ);
    expect(r.monthlyEquivalent).toBe(0);
    expect(r.dueThisMonth).toBe(0);
  });
});

describe("orden", () => {
  const porVencer = gasto(10, 1, "2026-08-01");
  const caro = gasto(1200, 1, "2026-12-01");
  const inactivo = gasto(9999, 1, "2026-01-01", false);

  it("por vencimiento, el más cercano primero", () => {
    const orden = sortFixedExpenses([caro, porVencer], "vencimiento");
    expect(orden[0]).toBe(porVencer);
  });

  it("por costo, el más caro al mes primero", () => {
    const orden = sortFixedExpenses([porVencer, caro], "costo");
    expect(orden[0]).toBe(caro);
  });

  it("los inactivos van al final ordenen como ordenen", () => {
    for (const criterio of ["vencimiento", "costo"] as const) {
      const orden = sortFixedExpenses([inactivo, caro, porVencer], criterio);
      expect(orden[orden.length - 1]).toBe(inactivo);
    }
  });
});

describe("equivalente semanal", () => {
  it("divide entre 4, la convención del Excel del usuario", () => {
    // Deliberadamente NO 4,33: ver `SEMANAS_POR_MES`. Con 4,33 saldrían 127,93
    // y dejaría de cuadrar con la hoja de la que salen estos datos.
    expect(weeklyEquivalent(556.25)).toBeCloseTo(139.0625, 4);
    expect(SEMANAS_POR_MES).toBe(4);
  });

  it("cero al mes es cero a la semana", () => {
    expect(weeklyEquivalent(0)).toBe(0);
  });
});

describe("agrupación por categoría", () => {
  const conCategoria = (
    amount: number,
    everyMonths: number,
    categoryId: string | null,
    isActive = true,
  ) => ({ ...gasto(amount, everyMonths, "2026-08-15", isActive), categoryId });

  const nombres: Record<string, string> = { tec: "Tecnología", tra: "Transporte" };
  const nombreDe = (id: string) => nombres[id];

  it("suma el subtotal de cada categoría", () => {
    const grupos = groupFixedExpensesByCategory(
      [
        conCategoria(112, 1, "tec"),
        conCategoria(112, 12, "tec"),
        conCategoria(200, 1, "tra"),
      ],
      nombreDe,
      "costo",
    );

    expect(grupos).toHaveLength(2);
    const tecnologia = grupos.find((g) => g.categoryName === "Tecnología")!;
    expect(tecnologia.monthlyEquivalent).toBeCloseTo(121.3333, 4);
    expect(tecnologia.expenses).toHaveLength(2);
  });

  it("los grupos van de mayor a menor subtotal", () => {
    const grupos = groupFixedExpensesByCategory(
      [conCategoria(10, 1, "tec"), conCategoria(200, 1, "tra")],
      nombreDe,
      "costo",
    );
    expect(grupos.map((g) => g.categoryName)).toEqual(["Transporte", "Tecnología"]);
  });

  it("los subtotales suman el mismo total que la cabecera", () => {
    // Es la propiedad que hace fiable la vista agrupada: si no cuadrase, el
    // usuario vería dos verdades distintas en la misma pantalla.
    const lista = [
      conCategoria(112, 1, "tec"),
      conCategoria(390, 12, "tra"),
      conCategoria(51, 1, null),
    ];
    const grupos = groupFixedExpensesByCategory(lista, nombreDe, "costo");
    const sumaSubtotales = grupos.reduce((s, g) => s + g.monthlyEquivalent, 0);

    expect(sumaSubtotales).toBeCloseTo(
      summarizeFixedExpenses(lista, 2026, 8, dia("2026-08-01"), TZ).monthlyEquivalent,
      10,
    );
  });

  it("los inactivos siguen en su grupo pero no suman al subtotal", () => {
    const grupos = groupFixedExpensesByCategory(
      [conCategoria(100, 1, "tec"), conCategoria(9999, 1, "tec", false)],
      nombreDe,
      "costo",
    );
    expect(grupos[0]!.expenses).toHaveLength(2);
    expect(grupos[0]!.monthlyEquivalent).toBe(100);
  });

  it("los que no tienen categoría caen en un grupo aparte, siempre el último", () => {
    const grupos = groupFixedExpensesByCategory(
      [conCategoria(9999, 1, null), conCategoria(10, 1, "tec")],
      nombreDe,
      "costo",
    );
    expect(grupos[grupos.length - 1]!.categoryName).toBe(SIN_CATEGORIA);
    expect(grupos[grupos.length - 1]!.categoryId).toBeNull();
  });

  it("una categoría borrada cae al cajón de sastre, no crea un grupo sin nombre", () => {
    const grupos = groupFixedExpensesByCategory(
      [conCategoria(10, 1, "ya-no-existe")],
      nombreDe,
      "costo",
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.categoryName).toBe(SIN_CATEGORIA);
  });
});
