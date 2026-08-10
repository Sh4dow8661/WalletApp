import { describe, expect, it } from "vitest";

import { zonedTime } from "../dates.ts";
import { normalizeAmount, parseReceipt } from "./parser.ts";
import { isEmptyReceipt } from "./types.ts";
import type { ReceiptLine } from "./types.ts";

/**
 * Portado de `ReceiptParserTest.kt`, caso por caso y con los mismos datos de
 * entrada. Se añaden algunas comprobaciones extra donde el port a TypeScript
 * podía divergir del original (regex globales, `Number` vs `toDouble`).
 */

const PR = "America/Puerto_Rico";

/** Convierte un texto multilínea en líneas con `top` incremental. */
function linesOf(raw: string): ReceiptLine[] {
  return raw
    .trim()
    .split("\n")
    .map((t, i) => ({ text: t.trim(), top: i * 10 }));
}

const fecha = (year: number, month: number, day: number) =>
  zonedTime({ year, month, day }, PR);

describe("normalizeAmount", () => {
  it("normaliza el formato US, con coma de miles y punto decimal", () => {
    expect(normalizeAmount("1,234.56")).toBeCloseTo(1234.56, 3);
    expect(normalizeAmount("$1,234.56")).toBeCloseTo(1234.56, 3);
  });

  it("normaliza el formato europeo/LATAM, con punto de miles y coma decimal", () => {
    expect(normalizeAmount("1.234,56")).toBeCloseTo(1234.56, 3);
    expect(normalizeAmount("1.234.567,89")).toBeCloseTo(1234567.89, 3);
  });

  it("distingue el separador de miles del decimal según las cifras que le siguen", () => {
    expect(normalizeAmount("1,234")).toBeCloseTo(1234, 3); // miles
    expect(normalizeAmount("1.234")).toBeCloseTo(1234, 3); // miles
    expect(normalizeAmount("12,50")).toBeCloseTo(12.5, 3); // decimal
    expect(normalizeAmount("100")).toBeCloseTo(100, 3);
  });

  it("devuelve null si no hay ninguna cifra", () => {
    expect(normalizeAmount("")).toBeNull();
    expect(normalizeAmount("$")).toBeNull();
    expect(normalizeAmount(".,.")).toBeNull();
  });
});

describe("total", () => {
  it("extrae el total e ignora subtotal, IVA, efectivo y cambio", () => {
    const receipt = linesOf(`
      WALMART SUPERCENTER
      AV. UNIVERSIDAD 123
      RFC WAL9709244W4
      TEL. 55 1234 5678
      Leche            25.00
      Pan              18.50
      SUBTOTAL        100.00
      IVA              16.00
      TOTAL           116.00
      EFECTIVO        200.00
      CAMBIO           84.00
      FECHA: 15/03/2024
      GRACIAS POR SU COMPRA
    `);

    const result = parseReceipt(receipt, PR);

    expect(result.total).toBeCloseTo(116.0, 3);
    expect(result.totalConfidence).toBe("HIGH");
    expect(result.merchant).toBe("WALMART SUPERCENTER");
    expect(result.merchantConfidence).toBe("HIGH");
    expect(result.date).toBe(fecha(2024, 3, 15));
  });

  it("toma el importe del renglón de abajo y normaliza los decimales con coma", () => {
    const receipt = linesOf(`
      OXXO
      TIENDAS OXXO SA DE CV
      SUBTOTAL
      86,21
      IVA
      13,79
      TOTAL
      100,00
    `);

    const result = parseReceipt(receipt, PR);

    expect(result.total).toBeCloseTo(100.0, 3);
    // El importe estaba en la línea contigua, no en la de la palabra clave.
    expect(result.totalConfidence).toBe("MEDIUM");
    expect(result.merchant).toBe("OXXO");
  });

  it("con varios totales elige el mayor", () => {
    const receipt = linesOf(`
      RESTAURANTE EL BUEN SABOR
      TOTAL PARCIAL     50.00
      TOTAL A PAGAR    116.00
    `);

    expect(parseReceipt(receipt, PR).total).toBeCloseTo(116.0, 3);
  });

  it("sin palabra clave usa el importe mayor, con confianza baja", () => {
    const receipt = linesOf(`
      TIENDA LOCAL
      Producto A 30.00
      Producto B 45.50
    `);

    const result = parseReceipt(receipt, PR);
    expect(result.total).toBeCloseTo(45.5, 3);
    expect(result.totalConfidence).toBe("LOW");
  });

  it("sin importes no devuelve total", () => {
    const receipt = linesOf(`
      TIENDA SIN NUMEROS
      GRACIAS POR SU VISITA
    `);

    expect(parseReceipt(receipt, PR).total).toBeNull();
  });

  it("una lista vacía devuelve un recibo vacío", () => {
    const result = parseReceipt([], PR);
    expect(isEmptyReceipt(result)).toBe(true);
    expect(result.total).toBeNull();
    expect(result.merchant).toBeNull();
  });

  it("a igualdad de importe se queda con el de más abajo", () => {
    // Detalle del original: `maxWith(compareBy { amount }.thenBy { index })`.
    const receipt = linesOf(`
      TIENDA
      TOTAL PARCIAL 50.00
      TOTAL A PAGAR 50.00
    `);
    expect(parseReceipt(receipt, PR).total).toBeCloseTo(50.0, 3);
  });
});

describe("tienda", () => {
  it("salta los encabezados de ruido", () => {
    const receipt = linesOf(`
      TICKET DE COMPRA
      SORIANA HIPER
      CALLE FALSA 123
      TOTAL 250.00
    `);

    const result = parseReceipt(receipt, PR);
    expect(result.merchant).toBe("SORIANA HIPER");
    // No era la primera línea, así que la confianza baja a media.
    expect(result.merchantConfidence).toBe("MEDIUM");
  });

  it("descarta líneas con RFC, teléfono o mayoría de dígitos", () => {
    const receipt = linesOf(`
      RFC WAL9709244W4
      5512345678
      AV. UNIVERSIDAD 123
      PANADERIA LA ESPIGA
      TOTAL 45.00
    `);
    expect(parseReceipt(receipt, PR).merchant).toBe("PANADERIA LA ESPIGA");
  });
});

describe("fecha", () => {
  it("parsea el formato ISO", () => {
    const receipt = linesOf(`
      TIENDA
      2024-03-15
      TOTAL 10.00
    `);

    const result = parseReceipt(receipt, PR);
    expect(result.date).toBe(fecha(2024, 3, 15));
    expect(result.dateConfidence).toBe("HIGH");
  });

  it("parsea dd-MM-yy con año de dos cifras", () => {
    const receipt = linesOf(`
      TIENDA
      FECHA 09-04-23
      TOTAL 10.00
    `);

    const result = parseReceipt(receipt, PR);
    expect(result.date).toBe(fecha(2023, 4, 9));
    // Año de dos cifras: se expande a 20xx, pero con menos confianza.
    expect(result.dateConfidence).toBe("MEDIUM");
  });

  it("sin fecha, la confianza es baja y la fecha nula", () => {
    const receipt = linesOf(`
      TIENDA
      TOTAL 10.00
    `);

    const result = parseReceipt(receipt, PR);
    expect(result.date).toBeNull();
    expect(result.dateConfidence).toBe("LOW");
  });

  it("intercambia día y mes si el mes no es válido (formato US)", () => {
    const receipt = linesOf(`
      TIENDA
      FECHA 03/15/2024
      TOTAL 10.00
    `);
    expect(parseReceipt(receipt, PR).date).toBe(fecha(2024, 3, 15));
  });

  it("descarta una fecha imposible en vez de recortarla", () => {
    // 31 de febrero no existe. Devolver null deja que el llamador use la fecha
    // actual, que es mejor que inventarse el 28.
    const receipt = linesOf(`
      TIENDA
      FECHA 31/02/2024
      TOTAL 10.00
    `);
    expect(parseReceipt(receipt, PR).date).toBeNull();
  });

  it("construye la fecha en la zona del usuario, no en UTC", () => {
    // Es la única diferencia deliberada con el original: en el Worker no hay
    // "zona local", así que entra por parámetro.
    const receipt = linesOf(`
      TIENDA
      2024-03-15
      TOTAL 10.00
    `);
    expect(parseReceipt(receipt, PR).date).toBe(fecha(2024, 3, 15));
    expect(parseReceipt(receipt, "Asia/Tokyo").date).toBe(
      zonedTime({ year: 2024, month: 3, day: 15 }, "Asia/Tokyo"),
    );
  });
});

describe("moneda", () => {
  it("detecta el símbolo de moneda", () => {
    const receipt = linesOf(`
      TIENDA
      TOTAL $116.00 MXN
    `);
    expect(parseReceipt(receipt, PR).currencyRaw).not.toBeNull();
  });

  it("prefiere el código explícito al símbolo", () => {
    const receipt = linesOf(`
      TIENDA
      TOTAL 116.00 MXN
    `);
    expect(parseReceipt(receipt, PR).currencyRaw).toBe("MXN");
  });
});

describe("robustez del port", () => {
  it("no arrastra estado entre llamadas", () => {
    // La regex de importes lleva la bandera /g, que en JavaScript mantiene
    // `lastIndex` entre usos si se reutiliza mal. Dos llamadas idénticas tienen
    // que dar lo mismo.
    const receipt = linesOf(`
      TIENDA
      TOTAL 42.00
    `);
    const primera = parseReceipt(receipt, PR);
    const segunda = parseReceipt(receipt, PR);
    expect(segunda).toEqual(primera);
  });

  it("ordena las líneas de arriba abajo aunque lleguen desordenadas", () => {
    const desordenado: ReceiptLine[] = [
      { text: "TOTAL 99.00", top: 30 },
      { text: "SUPERMERCADO EL SOL", top: 0 },
      { text: "SUBTOTAL 85.00", top: 20 },
    ];
    const result = parseReceipt(desordenado, PR);
    expect(result.merchant).toBe("SUPERMERCADO EL SOL");
    expect(result.total).toBeCloseTo(99.0, 3);
  });

  it("ignora las líneas en blanco", () => {
    const receipt: ReceiptLine[] = [
      { text: "   ", top: 0 },
      { text: "FRUTERIA LA HUERTA", top: 10 },
      { text: "", top: 20 },
      { text: "TOTAL 12.30", top: 30 },
    ];
    const result = parseReceipt(receipt, PR);
    expect(result.merchant).toBe("FRUTERIA LA HUERTA");
    expect(result.total).toBeCloseTo(12.3, 3);
  });
});
