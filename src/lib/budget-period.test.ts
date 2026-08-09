import { describe, expect, it } from "vitest";

import { budgetMetrics, currentPeriod, isBudgetActive } from "./budget-period.ts";
import { MS_PER_DAY, dayKey, zonedTime } from "./dates.ts";

const PR = "America/Puerto_Rico"; // UTC−4, sin horario de verano
const NY = "America/New_York"; // con horario de verano, para los casos de DST

/** Instante local en una zona, para escribir los casos de forma legible. */
const at = (
  tz: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number => zonedTime({ year, month, day, hour, minute }, tz);

/** Formatea un período como par de claves de día locales, para leer los fallos. */
const asDays = (p: { start: number; end: number }, tz: string) =>
  `${dayKey(p.start, tz)} .. ${dayKey(p.end, tz)}`;

describe("currentPeriod — NONE", () => {
  it("devuelve el rango tal cual", () => {
    const start = at(PR, 2026, 1, 1);
    const end = at(PR, 2026, 12, 31, 23, 59);
    expect(currentPeriod(start, end, "NONE", at(PR, 2026, 6, 15), PR)).toEqual({
      start,
      end,
    });
  });

  it("lo devuelve aunque `now` quede fuera del rango", () => {
    const start = at(PR, 2026, 1, 1);
    const end = at(PR, 2026, 1, 31);
    expect(currentPeriod(start, end, "NONE", at(PR, 2027, 5, 5), PR)).toEqual({
      start,
      end,
    });
  });
});

describe("currentPeriod — WEEKLY y BIWEEKLY", () => {
  const start = at(PR, 2026, 1, 5); // lunes

  it("el primer período empieza en el ancla", () => {
    const p = currentPeriod(start, 0, "WEEKLY", at(PR, 2026, 1, 7), PR);
    expect(p.start).toBe(start);
    expect(p.end).toBe(start + 7 * MS_PER_DAY - 1);
  });

  it("rueda en bloques de 7 días", () => {
    const p = currentPeriod(start, 0, "WEEKLY", at(PR, 2026, 1, 20), PR);
    expect(p.start).toBe(start + 14 * MS_PER_DAY);
    expect(p.end).toBe(start + 21 * MS_PER_DAY - 1);
  });

  it("rueda en bloques de 14 días cuando es quincenal", () => {
    const p = currentPeriod(start, 0, "BIWEEKLY", at(PR, 2026, 2, 10), PR);
    expect(p.end - p.start).toBe(14 * MS_PER_DAY - 1);
    expect(at(PR, 2026, 2, 10)).toBeGreaterThanOrEqual(p.start);
    expect(at(PR, 2026, 2, 10)).toBeLessThanOrEqual(p.end);
  });

  it("los períodos consecutivos no dejan hueco ni se solapan", () => {
    let previo = currentPeriod(start, 0, "WEEKLY", start, PR);
    for (let semana = 1; semana < 30; semana++) {
      const p = currentPeriod(start, 0, "WEEKLY", start + semana * 7 * MS_PER_DAY, PR);
      expect(p.start).toBe(previo.end + 1);
      previo = p;
    }
  });
});

describe("currentPeriod — MONTHLY", () => {
  it("empieza en el día del mes del ancla", () => {
    const start = at(PR, 2026, 1, 15);
    const p = currentPeriod(start, 0, "MONTHLY", at(PR, 2026, 3, 20), PR);
    expect(asDays(p, PR)).toBe("2026-03-15 .. 2026-04-14");
  });

  it("si el corte de este mes aún no llegó, sigue en el período anterior", () => {
    const start = at(PR, 2026, 1, 15);
    const p = currentPeriod(start, 0, "MONTHLY", at(PR, 2026, 3, 10), PR);
    expect(asDays(p, PR)).toBe("2026-02-15 .. 2026-03-14");
  });

  it("recorta el ancla 31 al último día de febrero", () => {
    // Caso obligatorio de §8.5.
    const start = at(PR, 2026, 1, 31);
    const p = currentPeriod(start, 0, "MONTHLY", at(PR, 2026, 3, 1), PR);
    expect(dayKey(p.start, PR)).toBe("2026-02-28");
  });

  it("recorta el ancla 31 en un mes de 30 días", () => {
    // Caso obligatorio de §8.5.
    const start = at(PR, 2026, 1, 31);
    const p = currentPeriod(start, 0, "MONTHLY", at(PR, 2026, 4, 30), PR);
    expect(dayKey(p.start, PR)).toBe("2026-04-30");
  });

  it("incluye el instante exacto del corte en el período nuevo", () => {
    // Caso obligatorio de §8.5: `now` justo en el corte.
    const start = at(PR, 2026, 1, 15, 9, 30);
    const corte = at(PR, 2026, 3, 15, 9, 30);

    expect(currentPeriod(start, 0, "MONTHLY", corte, PR).start).toBe(corte);
    // Un milisegundo antes todavía es el período anterior, y termina justo ahí.
    expect(currentPeriod(start, 0, "MONTHLY", corte - 1, PR).end).toBe(corte - 1);
  });

  it("devuelve el primer período si el presupuesto empieza en el futuro", () => {
    // Caso obligatorio de §8.5.
    const start = at(PR, 2026, 9, 10);
    const p = currentPeriod(start, 0, "MONTHLY", at(PR, 2026, 8, 1), PR);
    expect(p.start).toBe(start);
    expect(asDays(p, PR)).toBe("2026-09-10 .. 2026-10-09");
  });
});

describe("currentPeriod — MONTHLY: regresión de los huecos del original", () => {
  /**
   * La app Android calculaba el fin como `inicio + 1 mes − 1 ms`. Con ancla el
   * 31, eso dejaba días sin período: medido en la JVM, el 28, 29 y 30 de marzo
   * y el 30 de mayo de 2026. Un gasto de esos días desaparecía del cálculo.
   *
   * Estos son los casos concretos que fallaban.
   */
  const start = at(PR, 2026, 1, 31);

  it.each([
    ["2026-03-28", at(PR, 2026, 3, 28, 12)],
    ["2026-03-29", at(PR, 2026, 3, 29, 12)],
    ["2026-03-30", at(PR, 2026, 3, 30, 12)],
    ["2026-05-30", at(PR, 2026, 5, 30, 12)],
  ])("el día %s pertenece a un período", (_etiqueta, now) => {
    const p = currentPeriod(start, 0, "MONTHLY", now, PR);
    expect(now).toBeGreaterThanOrEqual(p.start);
    expect(now).toBeLessThanOrEqual(p.end);
  });

  it("no deja ningún día sin período en dos años, con cualquier ancla", () => {
    // Barrido exhaustivo: si quedara un solo hueco, esto lo encuentra.
    for (const anchorDay of [1, 15, 28, 29, 30, 31]) {
      const ancla = at(PR, 2026, 1, Math.min(anchorDay, 31));
      for (let dia = 0; dia < 730; dia++) {
        const now = ancla + dia * MS_PER_DAY + MS_PER_DAY / 2;
        const p = currentPeriod(ancla, 0, "MONTHLY", now, PR);
        expect(
          now >= p.start && now <= p.end,
          `ancla ${anchorDay}, día +${dia} (${dayKey(now, PR)}) fuera de ${asDays(p, PR)}`,
        ).toBe(true);
      }
    }
  });

  it("encadena los períodos sin hueco ni solape", () => {
    let previo = currentPeriod(start, 0, "MONTHLY", start, PR);
    for (let mes = 1; mes < 24; mes++) {
      const p = currentPeriod(start, 0, "MONTHLY", previo.end + 1, PR);
      expect(
        p.start,
        `el período ${mes} debía empezar justo tras ${asDays(previo, PR)}`,
      ).toBe(previo.end + 1);
      previo = p;
    }
  });
});

describe("currentPeriod — horario de verano", () => {
  // Caso obligatorio de §8.5. En Nueva York el DST entra el 8-mar-2026 y sale
  // el 1-nov-2026.
  it("mantiene la hora local del corte al cruzar el cambio de horario", () => {
    const start = at(NY, 2026, 1, 10, 9, 0); // 10 de enero, 9:00 (EST)
    const p = currentPeriod(start, 0, "MONTHLY", at(NY, 2026, 4, 20), NY);
    // Abril ya está en EDT: el corte sigue siendo a las 9:00 locales, aunque el
    // instante UTC se haya desplazado una hora.
    expect(dayKey(p.start, NY)).toBe("2026-04-10");
    expect(
      new Intl.DateTimeFormat("en", {
        timeZone: NY,
        hour: "2-digit",
        hour12: false,
      }).format(p.start),
    ).toBe("09");
  });

  it("no deja huecos alrededor del cambio de horario", () => {
    const start = at(NY, 2026, 1, 31);
    for (let dia = 0; dia < 400; dia++) {
      const now = start + dia * MS_PER_DAY + MS_PER_DAY / 2;
      const p = currentPeriod(start, 0, "MONTHLY", now, NY);
      expect(now >= p.start && now <= p.end, `día +${dia} sin período`).toBe(true);
    }
  });
});

describe("budgetMetrics", () => {
  const periodo = { start: at(PR, 2026, 8, 1), end: at(PR, 2026, 8, 31, 23, 59) };

  it("acota el progreso entre 0 y 1 aunque se pase del presupuesto", () => {
    expect(budgetMetrics(100, 150, periodo, at(PR, 2026, 8, 15), PR).progress).toBe(1);
    expect(budgetMetrics(100, 0, periodo, at(PR, 2026, 8, 15), PR).progress).toBe(0);
  });

  it("separa lo que queda de lo que se pasó, sin negativos", () => {
    const dentro = budgetMetrics(100, 30, periodo, at(PR, 2026, 8, 15), PR);
    expect(dentro.remaining).toBe(70);
    expect(dentro.overspent).toBe(0);
    expect(dentro.isOverBudget).toBe(false);

    const fuera = budgetMetrics(100, 130, periodo, at(PR, 2026, 8, 15), PR);
    expect(fuera.remaining).toBe(0);
    expect(fuera.overspent).toBe(30);
    expect(fuera.isOverBudget).toBe(true);
  });

  it("avisa cerca del límite solo si no se ha pasado", () => {
    expect(budgetMetrics(100, 80, periodo, at(PR, 2026, 8, 15), PR).isNearLimit).toBe(
      true,
    );
    expect(budgetMetrics(100, 79, periodo, at(PR, 2026, 8, 15), PR).isNearLimit).toBe(
      false,
    );
    expect(budgetMetrics(100, 101, periodo, at(PR, 2026, 8, 15), PR).isNearLimit).toBe(
      false,
    );
  });

  it("cuenta 31 días en agosto y los va descontando", () => {
    const m = budgetMetrics(310, 100, periodo, at(PR, 2026, 8, 1, 12), PR);
    expect(m.periodDurationDays).toBe(31);
    expect(m.daysRemaining).toBe(31);
  });

  it("deja los días restantes en 0 cuando el período ya pasó", () => {
    const m = budgetMetrics(100, 50, periodo, at(PR, 2026, 9, 5), PR);
    expect(m.daysRemaining).toBe(0);
    expect(m.suggestedDailySpend).toBe(0);
  });

  it("no divide por cero el primer día del período", () => {
    // El original acota daysElapsed a 1 justo para esto.
    const m = budgetMetrics(310, 10, periodo, at(PR, 2026, 8, 1, 12), PR);
    expect(Number.isFinite(m.averageDailySpend)).toBe(true);
    expect(m.averageDailySpend).toBe(10);
  });

  it("reparte lo que queda entre los días que quedan", () => {
    const m = budgetMetrics(310, 100, periodo, at(PR, 2026, 8, 21, 12), PR);
    expect(m.daysRemaining).toBe(11);
    expect(m.suggestedDailySpend).toBeCloseTo(210 / 11, 10);
  });

  it("da progreso 0 si el presupuesto no tiene importe", () => {
    expect(budgetMetrics(0, 50, periodo, at(PR, 2026, 8, 15), PR).progress).toBe(0);
  });
});

describe("isBudgetActive", () => {
  const start = at(PR, 2026, 1, 1);
  const end = at(PR, 2026, 1, 31, 23, 59);

  it("los de una sola vez solo están activos dentro de su rango", () => {
    expect(isBudgetActive(start, end, "NONE", at(PR, 2026, 1, 15))).toBe(true);
    expect(isBudgetActive(start, end, "NONE", at(PR, 2026, 2, 1))).toBe(false);
    expect(isBudgetActive(start, end, "NONE", at(PR, 2025, 12, 31))).toBe(false);
  });

  it("los recurrentes están activos desde su inicio, sin fin", () => {
    expect(isBudgetActive(start, end, "MONTHLY", at(PR, 2030, 6, 1))).toBe(true);
    expect(isBudgetActive(start, end, "MONTHLY", at(PR, 2025, 12, 31))).toBe(false);
  });
});
