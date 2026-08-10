import { describe, expect, it } from "vitest";

import { monthlyEquivalent } from "./gastos-fijos.ts";
import {
  categoryNamesIn,
  claveDeNombre,
  colorParaCategoria,
  iconoParaCategoria,
  parsePastedFixedExpenses,
} from "./importar-gastos-fijos.ts";
import { roundToCents } from "./money.ts";

/**
 * La hoja de cálculo real del usuario, tal cual la copiaría de Excel: columnas
 * separadas por tabulador y los importes con el símbolo de dólar.
 *
 * Los 13 gastos tienen que sumar **exactamente 556,25 al mes**. Es la cifra que
 * él ya lee en su Excel, así que cualquier desviación aquí significa que el
 * cálculo está mal, no que haya que redondear hasta que cuadre.
 */
const HOJA_DEL_USUARIO = [
  "Gasto\tCategoría\tPrecio por cargo\tCada N meses",
  "Claude Max\tTecnología\t$112.00\t1",
  "Google AI Plus\tTecnología\t$112.00\t12",
  "Internet\tTecnología\t$50.00\t1",
  "Teléfono\tTecnología\t$45.00\t1",
  "YouTube Premium\tTecnología\t$9.00\t1",
  "Gasolina\tTransporte\t$200.00\t1",
  "Marbete\tTransporte\t$200.00\t12",
  "Amazon Prime\tEntretenimiento\t$9.00\t1",
  "Creatina\tSalud\t$33.00\t6",
  "Planet Fitness\tSalud\t$390.00\t12",
  "Guimos\tAlimentación\t$51.00\t1",
  "Perfume\tPersonal\t$61.00\t6",
  "Costco Gold Star\tHogar\t$73.00\t12",
].join("\n");

const totalMensual = (
  filas: readonly { amount: number; everyMonths: number }[],
): number =>
  filas.reduce(
    (suma, fila) => suma + monthlyEquivalent({ ...fila, nextDueDate: 0, isActive: true }),
    0,
  );

describe("la hoja real del usuario", () => {
  const { rows, issues } = parsePastedFixedExpenses(HOJA_DEL_USUARIO);

  it("lee los 13 gastos sin dar ningún problema", () => {
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(13);
  });

  it("suma exactamente 556,25 al mes", () => {
    expect(roundToCents(totalMensual(rows))).toBe(556.25);
  });

  it("descuenta la cabecera y no la cuenta como un gasto", () => {
    expect(rows.map((f) => f.name)).not.toContain("Gasto");
    expect(rows[0]!.name).toBe("Claude Max");
  });

  it("reparte bien lo anual y lo semestral", () => {
    const porNombre = new Map(rows.map((f) => [f.name, f]));
    // 112 al año son 9,33 al mes; 390 al año, 32,50; 61 cada 6 meses, 10,17.
    expect(
      monthlyEquivalent({
        ...porNombre.get("Google AI Plus")!,
        nextDueDate: 0,
        isActive: true,
      }),
    ).toBeCloseTo(9.3333, 4);
    expect(
      monthlyEquivalent({
        ...porNombre.get("Planet Fitness")!,
        nextDueDate: 0,
        isActive: true,
      }),
    ).toBe(32.5);
    expect(
      monthlyEquivalent({ ...porNombre.get("Perfume")!, nextDueDate: 0, isActive: true }),
    ).toBeCloseTo(10.1667, 4);
  });

  it("saca las 7 categorías de la hoja", () => {
    expect(categoryNamesIn(rows)).toEqual([
      "Tecnología",
      "Transporte",
      "Entretenimiento",
      "Salud",
      "Alimentación",
      "Personal",
      "Hogar",
    ]);
  });
});

describe("formatos que puede tener el texto pegado", () => {
  it("lee una tabla de Markdown con su separador", () => {
    const { rows, issues } = parsePastedFixedExpenses(
      [
        "| Gasto | Categoría | Precio por cargo | Cada N meses |",
        "|-------|-----------|------------------|--------------|",
        "| Internet | Tecnología | $50.00 | 1 |",
        "| Marbete | Transporte | $200.00 | 12 |",
      ].join("\n"),
    );

    expect(issues).toEqual([]);
    expect(rows).toEqual([
      { name: "Internet", categoryName: "Tecnología", amount: 50, everyMonths: 1 },
      { name: "Marbete", categoryName: "Transporte", amount: 200, everyMonths: 12 },
    ]);
  });

  it("lee columnas separadas por punto y coma", () => {
    const { rows } = parsePastedFixedExpenses("Internet;Tecnología;50,00;1");
    expect(rows).toEqual([
      { name: "Internet", categoryName: "Tecnología", amount: 50, everyMonths: 1 },
    ]);
  });

  it("lee columnas alineadas con varios espacios", () => {
    const { rows } = parsePastedFixedExpenses("Internet   Tecnología   50.00   1");
    expect(rows).toEqual([
      { name: "Internet", categoryName: "Tecnología", amount: 50, everyMonths: 1 },
    ]);
  });

  it("no parte por comas: un importe de miles sigue entero", () => {
    // Es el motivo por el que la coma no es separador. Con cuatro celdas
    // separadas por tabulador, `1,234.56` tiene que llegar completo.
    const { rows } = parsePastedFixedExpenses("Alquiler\tHogar\t$1,234.56\t1");
    expect(rows[0]!.amount).toBe(1234.56);
  });

  it("se salta las líneas en blanco y aguanta los saltos de Windows", () => {
    const { rows, issues } = parsePastedFixedExpenses(
      "Internet\tTecnología\t$50.00\t1\r\n\r\nMarbete\tTransporte\t$200.00\t12\r\n",
    );
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it("admite una fila sin categoría si solo trae tres columnas", () => {
    const { rows, issues } = parsePastedFixedExpenses("Internet\t50\t1");
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      { name: "Internet", categoryName: "", amount: 50, everyMonths: 1 },
    ]);
  });
});

describe("filas que no se pueden usar", () => {
  it("no aborta la importación: recoge el problema y sigue con las demás", () => {
    const { rows, issues } = parsePastedFixedExpenses(
      [
        "Internet\tTecnología\t$50.00\t1",
        "Roto\tTecnología\tno-es-un-importe\t1",
        "Marbete\tTransporte\t$200.00\t12",
      ].join("\n"),
    );

    expect(rows.map((f) => f.name)).toEqual(["Internet", "Marbete"]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.line).toBe(2);
    expect(issues[0]!.message).toContain("Importe inválido");
  });

  it("rechaza el importe cero o negativo", () => {
    const { rows, issues } = parsePastedFixedExpenses(
      "Gratis\tTecnología\t0\t1\nDeuda\tTecnología\t-5\t1",
    );
    expect(rows).toEqual([]);
    expect(issues).toHaveLength(2);
  });

  it("rechaza una periodicidad que no sea un entero de 1 a 120", () => {
    const { issues } = parsePastedFixedExpenses(
      [
        "Cero\tTecnología\t$10.00\t0",
        "Medio\tTecnología\t$10.00\t1.5",
        "Siglo\tTecnología\t$10.00\t121",
      ].join("\n"),
    );
    expect(issues).toHaveLength(3);
    for (const problema of issues) {
      expect(problema.message).toContain("Cada cuántos meses inválido");
    }
  });

  it("rechaza la fila sin nombre", () => {
    const { rows, issues } = parsePastedFixedExpenses("\tTecnología\t$50.00\t1");
    expect(rows).toEqual([]);
    expect(issues[0]!.message).toBe("Falta el nombre del gasto");
  });

  it("avisa de que faltan columnas", () => {
    const { rows, issues } = parsePastedFixedExpenses("Internet\t50");
    expect(rows).toEqual([]);
    expect(issues[0]!.message).toContain("columnas suficientes");
  });

  it("un nombre repetido en el pegado se queda con la última fila y avisa", () => {
    const { rows, issues } = parsePastedFixedExpenses(
      "Internet\tTecnología\t$50.00\t1\nInternet\tTecnología\t$60.00\t1",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(60);
    expect(issues[0]!.message).toContain("repetido");
  });
});

describe("clave de nombre", () => {
  it("ignora acentos, mayúsculas y espacios de sobra", () => {
    expect(claveDeNombre("  TELÉFONO  ")).toBe("telefono");
    expect(claveDeNombre("Teléfono")).toBe(claveDeNombre("telefono"));
    expect(claveDeNombre("Planet   Fitness")).toBe("planet fitness");
  });

  it("es lo que hace que volver a pegar la hoja no duplique", () => {
    // El caso que importa: la app guardó «Teléfono» y el Excel trae «TELEFONO».
    expect(claveDeNombre("TELEFONO")).toBe(claveDeNombre("Teléfono"));
  });

  it("no confunde dos gastos distintos", () => {
    expect(claveDeNombre("Internet")).not.toBe(claveDeNombre("Internet 2"));
  });
});

describe("categorías que hay que crear", () => {
  it("da un icono con sentido a las de la hoja", () => {
    expect(iconoParaCategoria("Tecnología")).toBe("Computer");
    expect(iconoParaCategoria("Transporte")).toBe("DirectionsCar");
    expect(iconoParaCategoria("Entretenimiento")).toBe("Movie");
    expect(iconoParaCategoria("Salud")).toBe("LocalHospital");
    expect(iconoParaCategoria("Alimentación")).toBe("Restaurant");
    expect(iconoParaCategoria("Personal")).toBe("ShoppingCart");
    expect(iconoParaCategoria("Hogar")).toBe("Home");
  });

  it("cae al icono genérico si no reconoce el nombre", () => {
    expect(iconoParaCategoria("Chorradas varias")).toBe("Category");
  });

  it("da el mismo color a la misma categoría siempre", () => {
    // Estabilidad: dos importaciones de la misma hoja no pueden dejar la
    // pantalla cambiando de colores.
    expect(colorParaCategoria("Tecnología")).toBe(colorParaCategoria("tecnologia"));
    expect(colorParaCategoria("Hogar")).toBe(colorParaCategoria("Hogar"));
  });

  it("el color sale de la paleta de la app", () => {
    expect(colorParaCategoria("Tecnología")).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
