import { describe, expect, it } from "vitest";

import {
  MS_PER_DAY,
  addMonths,
  csvDateTime,
  dateInputToMillis,
  dayKey,
  dayOfMonth,
  daysBetween,
  daysInMonth,
  endOfDay,
  firstWeekdayOfMonth,
  millisToDateInput,
  monthLabel,
  monthRange,
  shortMonthLabel,
  startOfDay,
  yearMonth,
  zonedParts,
  zonedTime,
} from "./dates.ts";

const PR = "America/Puerto_Rico"; // UTC−4, sin DST
const MX = "America/Mexico_City"; // UTC−6
const NY = "America/New_York"; // con DST
const TOKIO = "Asia/Tokyo"; // UTC+9, al este de Greenwich

describe("dayKey — el bug del heatmap (§8.6)", () => {
  /**
   * La app Android agrupaba con `(date / 86400000) * 86400000`, que son días
   * UTC, y luego leía ese valor con un Calendar local. Dos desplazamientos
   * encadenados: en UTC−4, todo gasto anterior a las 20:00 locales acababa
   * mostrándose el día anterior.
   */
  it("agrupa por día local, no por día UTC", () => {
    // 9 de agosto de 2026, 10:00 en Puerto Rico = 14:00 UTC del mismo día.
    const manana = zonedTime({ year: 2026, month: 8, day: 9, hour: 10 }, PR);
    expect(dayKey(manana, PR)).toBe("2026-08-09");

    // El método viejo: truncar a día UTC y volver a leerlo en local.
    const alaAndroid = dayKey(Math.floor(manana / MS_PER_DAY) * MS_PER_DAY, PR);
    expect(alaAndroid).toBe("2026-08-08"); // corrido un día, como en la app vieja
  });

  it("mantiene el día correcto a lo largo de las 24 horas locales", () => {
    for (let hora = 0; hora < 24; hora++) {
      const t = zonedTime({ year: 2026, month: 8, day: 9, hour: hora }, PR);
      expect(dayKey(t, PR), `falla a las ${hora}:00`).toBe("2026-08-09");
    }
  });

  it("un mismo instante cae en días distintos según la zona", () => {
    // 9 de agosto, 23:00 en Puerto Rico = 10 de agosto, 03:00 UTC.
    const t = zonedTime({ year: 2026, month: 8, day: 9, hour: 23 }, PR);
    expect(dayKey(t, PR)).toBe("2026-08-09");
    expect(dayKey(t, MX)).toBe("2026-08-09"); // 21:00 en México
    expect(dayKey(t, TOKIO)).toBe("2026-08-10"); // 12:00 del día siguiente
  });
});

describe("startOfDay y endOfDay", () => {
  it("acotan exactamente el día local", () => {
    const t = zonedTime({ year: 2026, month: 8, day: 9, hour: 15, minute: 42 }, PR);
    const inicio = startOfDay(t, PR);
    const fin = endOfDay(t, PR);

    expect(dayKey(inicio, PR)).toBe("2026-08-09");
    expect(dayKey(fin, PR)).toBe("2026-08-09");
    expect(fin - inicio).toBe(MS_PER_DAY - 1);
    expect(inicio).toBeLessThanOrEqual(t);
    expect(fin).toBeGreaterThanOrEqual(t);
  });

  it("el final de un día y el principio del siguiente son contiguos", () => {
    const t = zonedTime({ year: 2026, month: 8, day: 9, hour: 12 }, PR);
    const siguiente = zonedTime({ year: 2026, month: 8, day: 10, hour: 12 }, PR);
    expect(startOfDay(siguiente, PR) - endOfDay(t, PR)).toBe(1);
  });
});

describe("dateInputToMillis — el bug de los date pickers (§8.6)", () => {
  it("interpreta el valor de <input type=date> como medianoche LOCAL", () => {
    const millis = dateInputToMillis("2026-08-09", PR);
    expect(dayKey(millis, PR)).toBe("2026-08-09");

    // `new Date("2026-08-09")` lo lee como medianoche UTC, que en UTC−4 es el
    // día anterior a las 20:00. Ese es justo el fallo que arregló el commit
    // 36b465d en Android.
    expect(dayKey(new Date("2026-08-09").getTime(), PR)).toBe("2026-08-08");
  });

  it("va y vuelve sin perder el día", () => {
    for (const fecha of ["2026-01-01", "2026-02-28", "2026-06-15", "2026-12-31"]) {
      expect(millisToDateInput(dateInputToMillis(fecha, PR), PR)).toBe(fecha);
    }
  });

  it("funciona igual al este de Greenwich", () => {
    expect(millisToDateInput(dateInputToMillis("2026-08-09", TOKIO), TOKIO)).toBe(
      "2026-08-09",
    );
  });
});

describe("monthRange", () => {
  it("cubre el mes entero sin desbordarlo", () => {
    const { from, to } = monthRange(2026, 8, PR);
    expect(dayKey(from, PR)).toBe("2026-08-01");
    expect(dayKey(to, PR)).toBe("2026-08-31");
    // Un milisegundo más y ya sería septiembre.
    expect(dayKey(to + 1, PR)).toBe("2026-09-01");
  });

  it("acierta con febrero, con y sin año bisiesto", () => {
    expect(dayKey(monthRange(2026, 2, PR).to, PR)).toBe("2026-02-28");
    expect(dayKey(monthRange(2028, 2, PR).to, PR)).toBe("2028-02-29");
  });

  it("cruza bien el fin de año", () => {
    const { from, to } = monthRange(2026, 12, PR);
    expect(dayKey(from, PR)).toBe("2026-12-01");
    expect(dayKey(to, PR)).toBe("2026-12-31");
    expect(dayKey(to + 1, PR)).toBe("2027-01-01");
  });

  it("meses consecutivos encajan sin hueco", () => {
    let previo = monthRange(2026, 1, PR);
    for (let m = 2; m <= 12; m++) {
      const actual = monthRange(2026, m, PR);
      expect(actual.from).toBe(previo.to + 1);
      previo = actual;
    }
  });

  it("el mes con cambio de horario dura una hora menos y sigue siendo el mes", () => {
    // En Nueva York el DST entra el 8 de marzo de 2026.
    const { from, to } = monthRange(2026, 3, NY);
    expect(dayKey(from, NY)).toBe("2026-03-01");
    expect(dayKey(to, NY)).toBe("2026-03-31");
    expect(to - from + 1).toBe(31 * MS_PER_DAY - 60 * 60 * 1000);
  });
});

describe("addMonths", () => {
  it("suma dentro del mismo año", () => {
    expect(addMonths(2026, 3, 2)).toEqual({ year: 2026, month: 5 });
  });

  it("cruza el fin de año hacia delante y hacia atrás", () => {
    expect(addMonths(2026, 11, 3)).toEqual({ year: 2027, month: 2 });
    expect(addMonths(2026, 2, -3)).toEqual({ year: 2025, month: 11 });
  });

  it("aguanta saltos de varios años", () => {
    expect(addMonths(2026, 1, 25)).toEqual({ year: 2028, month: 2 });
    expect(addMonths(2026, 1, -25)).toEqual({ year: 2023, month: 12 });
  });

  it("no se mueve con delta 0", () => {
    expect(addMonths(2026, 8, 0)).toEqual({ year: 2026, month: 8 });
  });

  it("nunca devuelve un mes fuera de 1..12", () => {
    // Regresión: la primera versión usaba date-fns sobre un Date UTC y en una
    // zona al oeste de Greenwich devolvía el mes anterior.
    for (let delta = -40; delta <= 40; delta++) {
      const { month } = addMonths(2026, 6, delta);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    }
  });

  it("avanzar 12 veces un mes equivale a avanzar un año", () => {
    let ym = { year: 2026, month: 5 };
    for (let i = 0; i < 12; i++) ym = addMonths(ym.year, ym.month, 1);
    expect(ym).toEqual({ year: 2027, month: 5 });
  });
});

describe("daysInMonth y firstWeekdayOfMonth", () => {
  it("cuenta los días de cada mes", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("usa lunes = 0, como la cuadrícula del calendario", () => {
    // El 1 de agosto de 2026 es sábado.
    expect(firstWeekdayOfMonth(2026, 8)).toBe(5);
    // El 1 de junio de 2026 es lunes.
    expect(firstWeekdayOfMonth(2026, 6)).toBe(0);
  });
});

describe("zonedTime", () => {
  it("recorta el día al último disponible del mes", () => {
    // Lo que necesitan los presupuestos anclados a fin de mes (§8.5).
    expect(dayKey(zonedTime({ year: 2026, month: 2, day: 31 }, PR), PR)).toBe(
      "2026-02-28",
    );
    expect(dayKey(zonedTime({ year: 2028, month: 2, day: 31 }, PR), PR)).toBe(
      "2028-02-29",
    );
    expect(dayKey(zonedTime({ year: 2026, month: 4, day: 31 }, PR), PR)).toBe(
      "2026-04-30",
    );
  });

  it("conserva la hora local exacta", () => {
    const t = zonedTime(
      { year: 2026, month: 8, day: 9, hour: 9, minute: 30, second: 15 },
      PR,
    );
    expect(csvDateTime(t, PR)).toBe("2026-08-09 09:30:15");
  });

  it("va y vuelve con zonedParts", () => {
    const partes = {
      year: 2026,
      month: 8,
      day: 9,
      hour: 14,
      minute: 5,
      second: 30,
      ms: 250,
    };
    expect(zonedParts(zonedTime(partes, PR), PR)).toEqual(partes);
  });
});

describe("daysBetween", () => {
  it("cuenta días completos", () => {
    const a = zonedTime({ year: 2026, month: 8, day: 1 }, PR);
    const b = zonedTime({ year: 2026, month: 8, day: 31 }, PR);
    expect(daysBetween(a, b, PR)).toBe(30);
  });

  it("da 0 dentro del mismo día", () => {
    const a = zonedTime({ year: 2026, month: 8, day: 9, hour: 1 }, PR);
    const b = zonedTime({ year: 2026, month: 8, day: 9, hour: 23 }, PR);
    expect(daysBetween(a, b, PR)).toBe(0);
  });

  it("cuenta 1 día aunque el cambio de horario lo acorte a 23 horas", () => {
    // 7→8 de marzo de 2026 en Nueva York: ese día dura 23 h.
    const a = zonedTime({ year: 2026, month: 3, day: 7, hour: 12 }, NY);
    const b = zonedTime({ year: 2026, month: 3, day: 8, hour: 12 }, NY);
    expect(b - a).toBe(23 * 60 * 60 * 1000);
    expect(daysBetween(a, b, NY)).toBe(1);
  });
});

describe("etiquetas y formatos", () => {
  it("da el mes abreviado en español para el gráfico de 6 meses", () => {
    expect(shortMonthLabel(2026, 1)).toBe("ene");
    expect(shortMonthLabel(2026, 8)).toBe("ago");
    expect(shortMonthLabel(2026, 12)).toBe("dic");
  });

  it("da la cabecera de mes con la inicial en mayúscula", () => {
    expect(monthLabel(2026, 8)).toBe("Agosto 2026");
  });

  it("formatea la fecha del CSV como yyyy-MM-dd HH:mm:ss (§8.7)", () => {
    const t = zonedTime(
      { year: 2026, month: 1, day: 5, hour: 7, minute: 8, second: 9 },
      PR,
    );
    expect(csvDateTime(t, PR)).toBe("2026-01-05 07:08:09");
  });
});

describe("yearMonth y dayOfMonth", () => {
  it("leen las partes locales, no las UTC", () => {
    // 31 de diciembre, 22:00 en Puerto Rico = 1 de enero, 02:00 UTC.
    const t = zonedTime({ year: 2026, month: 12, day: 31, hour: 22 }, PR);
    expect(yearMonth(t, PR)).toEqual({ year: 2026, month: 12 });
    expect(dayOfMonth(t, PR)).toBe(31);
    // Leído en UTC ya sería el año siguiente.
    expect(yearMonth(t, "UTC")).toEqual({ year: 2027, month: 1 });
  });
});
