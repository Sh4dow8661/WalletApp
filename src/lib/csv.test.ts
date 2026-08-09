import { describe, expect, it } from "vitest";

import {
  CSV_HEADER,
  accountNamesIn,
  categoryNamesIn,
  csvFileName,
  pairTransfers,
  parseCsv,
  toCsv,
} from "./csv.ts";
import { zonedTime } from "./dates.ts";

const PR = "America/Puerto_Rico";
const en = (y: number, mo: number, d: number, h = 12, mi = 0, s = 0) =>
  zonedTime({ year: y, month: mo, day: d, hour: h, minute: mi, second: s }, PR);

describe("exportar", () => {
  it("escribe la cabecera exacta de la app Android (§8.7)", () => {
    expect(toCsv([], PR).split("\n")[0]).toBe(
      "Date,Type,Amount,Category,Account,TransferAccount,Note",
    );
  });

  it("escribe la fecha como yyyy-MM-dd HH:mm:ss en hora local", () => {
    const csv = toCsv(
      [
        {
          date: en(2026, 8, 9, 14, 30, 5),
          type: "EXPENSE",
          amount: 25.5,
          categoryName: "Comida",
          accountName: "Efectivo",
          note: "Almuerzo",
        },
      ],
      PR,
    );

    expect(csv.split("\n")[1]).toBe(
      "2026-08-09 14:30:05,EXPENSE,25.50,Comida,Efectivo,,Almuerzo",
    );
  });

  it("reemplaza por espacios las comas y saltos de línea de la nota", () => {
    // Igual que el original: cada transacción ocupa una sola línea.
    const csv = toCsv(
      [
        {
          date: en(2026, 8, 9),
          type: "EXPENSE",
          amount: 10,
          categoryName: "Comida",
          accountName: "Efectivo",
          note: "Pan, leche\ny huevos",
        },
      ],
      PR,
    );

    const linea = csv.split("\n")[1]!;
    expect(linea.split(",")).toHaveLength(7);
    expect(linea).toContain("Pan  leche y huevos");
  });

  it("deja vacías las columnas que no aplican", () => {
    const csv = toCsv(
      [{ date: en(2026, 8, 9), type: "INCOME", amount: 1000, accountName: "Banco" }],
      PR,
    );
    expect(csv.split("\n")[1]).toBe("2026-08-09 12:00:00,INCOME,1000.00,,Banco,,");
  });

  it("nombra el archivo como la app Android", () => {
    expect(csvFileName(1786000000000)).toBe("wallet_export_1786000000000.csv");
  });
});

describe("importar", () => {
  it("lee el formato que exporta la app Android", () => {
    // Ojo al importe: Kotlin escribe "25.5", no "25.50".
    const contenido = [
      CSV_HEADER,
      "2026-08-09 14:30:00,EXPENSE,25.5,Comida,Efectivo,,Almuerzo",
      "2026-08-08 09:00:00,INCOME,1500.0,Salario,Banco,,Nomina",
    ].join("\n");

    const { rows, issues } = parseCsv(contenido, PR);

    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      date: en(2026, 8, 9, 14, 30, 0),
      type: "EXPENSE",
      amount: 25.5,
      categoryName: "Comida",
      accountName: "Efectivo",
      transferAccountName: "",
      note: "Almuerzo",
    });
    expect(rows[1]!.amount).toBe(1500);
  });

  it("interpreta la fecha en la zona del usuario, no en UTC", () => {
    // El CSV no lleva desfase horario: leerlo como UTC correría todas las fechas.
    const contenido = `${CSV_HEADER}\n2026-08-09 00:30:00,EXPENSE,10.0,Comida,Efectivo,,`;
    const { rows } = parseCsv(contenido, PR);
    expect(rows[0]!.date).toBe(en(2026, 8, 9, 0, 30, 0));
  });

  it("va y vuelve sin perder datos", () => {
    const original = [
      {
        date: en(2026, 3, 1, 8, 15, 30),
        type: "EXPENSE" as const,
        amount: 42.75,
        categoryName: "Transporte",
        accountName: "Efectivo",
        transferAccountName: "",
        note: "Gasolina",
      },
    ];

    const { rows, issues } = parseCsv(toCsv(original, PR), PR);
    expect(issues).toEqual([]);
    expect(rows).toEqual(original);
  });

  it("aguanta CRLF, líneas vacías y BOM", () => {
    // El BOM (U+FEFF) es lo que antepone Excel al guardar en UTF-8. Se construye
    // por codepoint para no dejar un carácter invisible en el fuente.
    const bom = String.fromCharCode(0xfeff);
    const contenido = `${bom}${CSV_HEADER}\r\n2026-08-09 12:00:00,EXPENSE,10.0,Comida,Efectivo,,\r\n\r\n`;
    const { rows, issues } = parseCsv(contenido, PR);
    expect(rows).toHaveLength(1);
    expect(issues).toEqual([]);
  });

  it("sin quitar el BOM, la cabecera se leería como una fila", () => {
    // Regresión: si `stripBom` desapareciera, este test fallaría con un issue
    // extra por intentar parsear la cabecera como transacción.
    const bom = String.fromCharCode(0xfeff);
    const { rows, issues } = parseCsv(`${bom}${CSV_HEADER}\n`, PR);
    expect(rows).toEqual([]);
    expect(issues).toEqual([]);
  });

  it("admite campos entrecomillados aunque el exportador no los genere", () => {
    const contenido = `${CSV_HEADER}\n2026-08-09 12:00:00,EXPENSE,10.0,Comida,Efectivo,,"Pan, leche"`;
    const { rows } = parseCsv(contenido, PR);
    expect(rows[0]!.note).toBe("Pan, leche");
  });

  it("recoge las líneas malas en issues sin abortar la importación", () => {
    const contenido = [
      CSV_HEADER,
      "2026-08-09 12:00:00,EXPENSE,10.0,Comida,Efectivo,,buena",
      "fecha-mala,EXPENSE,10.0,Comida,Efectivo,,",
      "2026-08-09 12:00:00,VOLANDO,10.0,Comida,Efectivo,,",
      "2026-08-09 12:00:00,EXPENSE,-5,Comida,Efectivo,,",
      "muy,pocas,columnas",
      "2026-08-10 12:00:00,EXPENSE,20.0,Comida,Efectivo,,otra buena",
    ].join("\n");

    const { rows, issues } = parseCsv(contenido, PR);

    // Las dos buenas entran; las cuatro malas se reportan con su número de línea.
    expect(rows).toHaveLength(2);
    expect(issues).toHaveLength(4);
    expect(issues.map((i) => i.line)).toEqual([3, 4, 5, 6]);
  });

  it("funciona sin cabecera", () => {
    const { rows } = parseCsv("2026-08-09 12:00:00,EXPENSE,10.0,Comida,Efectivo,,", PR);
    expect(rows).toHaveLength(1);
  });
});

describe("reconstruir transferencias (§12)", () => {
  const transferencia = (date: number, amount: number, desde: string, hacia: string) => ({
    date,
    type: "TRANSFER" as const,
    amount,
    categoryName: "",
    accountName: desde,
    transferAccountName: hacia,
    note: "",
  });

  it("empareja las dos patas por fecha, importe y cuentas cruzadas", () => {
    const fecha = en(2026, 8, 9, 10);
    const filas = [
      transferencia(fecha, 300, "Efectivo", "Banco"),
      transferencia(fecha, 300, "Banco", "Efectivo"),
    ];

    const { pairs, orphans } = pairTransfers(filas);

    expect(pairs).toHaveLength(1);
    expect(orphans).toEqual([]);
    // Convención: la primera del archivo se toma como saliente.
    expect(pairs[0]!.outgoing.accountName).toBe("Efectivo");
    expect(pairs[0]!.incoming.accountName).toBe("Banco");
  });

  it("no cruza patas de transferencias distintas", () => {
    const fecha = en(2026, 8, 9, 10);
    const filas = [
      transferencia(fecha, 300, "Efectivo", "Banco"),
      transferencia(fecha, 300, "Banco", "Efectivo"),
      transferencia(fecha, 500, "Efectivo", "Banco"),
      transferencia(fecha, 500, "Banco", "Efectivo"),
    ];

    const { pairs, orphans } = pairTransfers(filas);

    expect(pairs).toHaveLength(2);
    expect(orphans).toEqual([]);
    expect(pairs.map((p) => p.outgoing.amount)).toEqual([300, 500]);
  });

  it("deja huérfana la pata cuyo par no cuadra", () => {
    // Es justo lo que deja el bug de §8.2: al editar solo se actualizaba una
    // fila, así que los importes ya no coinciden y no hay forma de emparejarlas.
    const fecha = en(2026, 8, 9, 10);
    const filas = [
      transferencia(fecha, 450, "Efectivo", "Banco"), // editada
      transferencia(fecha, 300, "Banco", "Efectivo"), // se quedó con el viejo
    ];

    const { pairs, orphans } = pairTransfers(filas);

    expect(pairs).toEqual([]);
    expect(orphans).toHaveLength(2);
  });

  it("deja huérfana una pata suelta", () => {
    const filas = [transferencia(en(2026, 8, 9, 10), 300, "Efectivo", "Banco")];
    const { pairs, orphans } = pairTransfers(filas);
    expect(pairs).toEqual([]);
    expect(orphans).toHaveLength(1);
  });

  it("no toca los ingresos ni los gastos", () => {
    const filas = [
      {
        date: en(2026, 8, 9),
        type: "EXPENSE" as const,
        amount: 10,
        categoryName: "Comida",
        accountName: "Efectivo",
        transferAccountName: "",
        note: "",
      },
    ];
    const { pairs, orphans } = pairTransfers(filas);
    expect(pairs).toEqual([]);
    expect(orphans).toEqual([]);
  });
});

describe("nombres a crear al importar", () => {
  const filas = [
    {
      date: en(2026, 8, 1),
      type: "EXPENSE" as const,
      amount: 10,
      categoryName: "Comida",
      accountName: "Efectivo",
      transferAccountName: "",
      note: "",
    },
    {
      date: en(2026, 8, 2),
      type: "INCOME" as const,
      amount: 100,
      categoryName: "Salario",
      accountName: "Banco",
      transferAccountName: "",
      note: "",
    },
    {
      date: en(2026, 8, 3),
      type: "TRANSFER" as const,
      amount: 50,
      categoryName: "",
      accountName: "Efectivo",
      transferAccountName: "Ahorros",
      note: "",
    },
  ];

  it("recoge todas las cuentas, incluidas las de destino", () => {
    expect(accountNamesIn(filas).sort()).toEqual(["Ahorros", "Banco", "Efectivo"]);
  });

  it("deduce el tipo de cada categoría por el de su transacción", () => {
    expect(categoryNamesIn(filas)).toEqual([
      { name: "Comida", type: "EXPENSE" },
      { name: "Salario", type: "INCOME" },
    ]);
  });

  it("no inventa categorías a partir de las transferencias", () => {
    const soloTransferencia = [filas[2]!];
    expect(categoryNamesIn(soloTransferencia)).toEqual([]);
    expect(accountNamesIn(soloTransferencia).sort()).toEqual(["Ahorros", "Efectivo"]);
  });
});
