import { describe, expect, it } from "vitest";

import { ImportError, parseExportAndroid, transformarExport } from "./import-json.ts";

/**
 * Tests de la lectura del volcado JSON de la app Android (§12).
 *
 * Lo que se comprueba aquí es lo que decide si la migración sale bien o mal: que
 * las referencias entre tablas sobrevivan al cambio de identificadores enteros a
 * UUID, y que las dos patas de cada transferencia acaben en el mismo grupo.
 */

const AHORA = 1_754_700_000_000;

/** Archivo mínimo válido, para ir sobrescribiendo secciones en cada test. */
function archivo(secciones: Partial<Record<string, unknown[]>> = {}): string {
  return JSON.stringify({
    formato: "walletapp-export",
    version: 1,
    exportadoEn: AHORA,
    zonaHoraria: "America/Puerto_Rico",
    moneda: "USD",
    cuentas: [],
    categorias: [],
    transacciones: [],
    presupuestos: [],
    enlaces: [],
    ...secciones,
  });
}

const CUENTA_EFECTIVO = {
  id: 1,
  name: "Efectivo",
  type: "CASH",
  initialBalance: 100,
  colorHex: "#4caf50",
  iconName: "Payments",
  includeInTotal: true,
};

const CUENTA_BANCO = {
  id: 2,
  name: "Banco",
  type: "BANK",
  initialBalance: 500,
  colorHex: "#42A5F5",
  iconName: "AccountBalance",
  includeInTotal: true,
};

const CATEGORIA_COMIDA = {
  id: 10,
  name: "Comida",
  type: "EXPENSE",
  iconName: "Restaurant",
  colorHex: "#FF7043",
  isDefault: true,
};

describe("parseExportAndroid", () => {
  it("acepta un archivo bien formado", () => {
    const datos = parseExportAndroid(archivo({ cuentas: [CUENTA_EFECTIVO] }));

    expect(datos.version).toBe(1);
    expect(datos.zonaHoraria).toBe("America/Puerto_Rico");
    expect(datos.cuentas).toHaveLength(1);
  });

  it("rechaza lo que no sea JSON", () => {
    expect(() => parseExportAndroid("esto no es json")).toThrow(ImportError);
  });

  it("rechaza un JSON que no sea de WalletApp", () => {
    expect(() => parseExportAndroid(JSON.stringify({ hola: "mundo" }))).toThrow(
      /no parece un export de WalletApp/,
    );
  });

  it("rechaza una versión de formato que no entiende", () => {
    const futuro = JSON.stringify({ formato: "walletapp-export", version: 99 });
    expect(() => parseExportAndroid(futuro)).toThrow(/solo entiende la 1/);
  });

  it("rechaza el archivo al que le falta una sección", () => {
    const incompleto = JSON.stringify({
      formato: "walletapp-export",
      version: 1,
      cuentas: [],
      categorias: [],
      transacciones: [],
      presupuestos: [],
      // faltan los enlaces
    });
    expect(() => parseExportAndroid(incompleto)).toThrow(/enlaces/);
  });

  it("descarta las entradas que no son objetos en vez de romperse", () => {
    const datos = parseExportAndroid(
      archivo({ cuentas: [CUENTA_EFECTIVO, "basura", 42, null] }),
    );
    expect(datos.cuentas).toHaveLength(1);
  });
});

describe("transformarExport", () => {
  it("traduce los identificadores y conserva las referencias", () => {
    const datos = transformarExport(
      parseExportAndroid(
        archivo({
          cuentas: [CUENTA_EFECTIVO],
          categorias: [CATEGORIA_COMIDA],
          transacciones: [
            {
              id: 100,
              amount: 25.5,
              type: "EXPENSE",
              categoryId: 10,
              accountId: 1,
              transferAccountId: null,
              note: "Almuerzo",
              date: AHORA,
              isOutgoing: false,
            },
          ],
        }),
      ),
      AHORA,
    );

    const [cuenta] = datos.cuentas;
    const [categoria] = datos.categorias;
    const [tx] = datos.transacciones;

    // Los identificadores dejan de ser enteros...
    expect(cuenta!.id).toMatch(/^[0-9a-f-]{36}$/);
    // ...pero la transacción sigue apuntando a las mismas filas.
    expect(tx!.accountId).toBe(cuenta!.id);
    expect(tx!.categoryId).toBe(categoria!.id);
    expect(tx!.amount).toBe(25.5);
    expect(tx!.note).toBe("Almuerzo");
  });

  it("normaliza el color a mayúsculas y respeta el resto de la cuenta", () => {
    const datos = transformarExport(
      parseExportAndroid(archivo({ cuentas: [CUENTA_EFECTIVO] })),
      AHORA,
    );

    expect(datos.cuentas[0]).toMatchObject({
      name: "Efectivo",
      type: "CASH",
      initialBalance: 100,
      colorHex: "#4CAF50",
      iconName: "Payments",
      includeInTotal: true,
    });
  });

  it("empareja las dos patas de una transferencia bajo el mismo grupo", () => {
    const datos = transformarExport(
      parseExportAndroid(
        archivo({
          cuentas: [CUENTA_EFECTIVO, CUENTA_BANCO],
          transacciones: [
            {
              id: 200,
              amount: 50,
              type: "TRANSFER",
              categoryId: null,
              accountId: 1,
              transferAccountId: 2,
              note: "",
              date: AHORA,
              isOutgoing: true,
            },
            {
              id: 201,
              amount: 50,
              type: "TRANSFER",
              categoryId: null,
              accountId: 2,
              transferAccountId: 1,
              note: "",
              date: AHORA,
              isOutgoing: false,
            },
          ],
        }),
      ),
      AHORA,
    );

    const [sale, entra] = datos.transacciones;
    expect(sale!.transferGroupId).not.toBeNull();
    expect(entra!.transferGroupId).toBe(sale!.transferGroupId);
    // La dirección viene del archivo, no se adivina.
    expect(sale!.isOutgoing).toBe(true);
    expect(entra!.isOutgoing).toBe(false);
    expect(datos.resumen.transferenciasEmparejadas).toBe(1);
    expect(datos.resumen.transferenciasHuerfanas).toBe(0);
  });

  it("importa la pata suelta de una transferencia descuadrada y avisa", () => {
    // Este es el destrozo del bug de §8.2: al editar, la app antigua cambiaba el
    // importe de una pata y dejaba la otra como estaba.
    const datos = transformarExport(
      parseExportAndroid(
        archivo({
          cuentas: [CUENTA_EFECTIVO, CUENTA_BANCO],
          transacciones: [
            {
              id: 200,
              amount: 50,
              type: "TRANSFER",
              categoryId: null,
              accountId: 1,
              transferAccountId: 2,
              note: "",
              date: AHORA,
              isOutgoing: true,
            },
            {
              id: 201,
              amount: 30, // descuadrada
              type: "TRANSFER",
              categoryId: null,
              accountId: 2,
              transferAccountId: 1,
              note: "",
              date: AHORA,
              isOutgoing: false,
            },
          ],
        }),
      ),
      AHORA,
    );

    // Se importan las dos: el dinero se movió, aunque los importes no casen.
    expect(datos.transacciones).toHaveLength(2);
    expect(datos.transacciones.every((t) => t.transferGroupId === null)).toBe(true);
    expect(datos.resumen.transferenciasHuerfanas).toBe(2);
    expect(datos.resumen.avisos.join(" ")).toMatch(/sin su pareja/);
  });

  it("no arrastra categoría en las transferencias (§8.2)", () => {
    const datos = transformarExport(
      parseExportAndroid(
        archivo({
          cuentas: [CUENTA_EFECTIVO, CUENTA_BANCO],
          categorias: [CATEGORIA_COMIDA],
          transacciones: [
            {
              id: 200,
              amount: 50,
              type: "TRANSFER",
              // Un archivo viejo podría traerla; no debe llegar a la base.
              categoryId: 10,
              accountId: 1,
              transferAccountId: 2,
              note: "",
              date: AHORA,
              isOutgoing: true,
            },
          ],
        }),
      ),
      AHORA,
    );

    expect(datos.transacciones[0]!.categoryId).toBeNull();
  });

  it("mantiene los enlaces con presupuestos", () => {
    const datos = transformarExport(
      parseExportAndroid(
        archivo({
          cuentas: [CUENTA_EFECTIVO],
          categorias: [CATEGORIA_COMIDA],
          presupuestos: [
            {
              id: 7,
              name: "Comida del mes",
              amount: 300,
              startDate: AHORA,
              endDate: AHORA + 86_400_000 * 30,
              recurrence: "MONTHLY",
            },
          ],
          transacciones: [
            {
              id: 100,
              amount: 25,
              type: "EXPENSE",
              categoryId: 10,
              accountId: 1,
              transferAccountId: null,
              note: "",
              date: AHORA,
              isOutgoing: false,
            },
          ],
          enlaces: [{ transactionId: 100, budgetId: 7 }],
        }),
      ),
      AHORA,
    );

    expect(datos.enlaces).toEqual([
      { transactionId: datos.transacciones[0]!.id, budgetId: datos.presupuestos[0]!.id },
    ]);
    expect(datos.presupuestos[0]!.recurrence).toBe("MONTHLY");
  });

  it("descarta el enlace que apunta a una fila ausente y lo dice", () => {
    const datos = transformarExport(
      parseExportAndroid(
        archivo({
          cuentas: [CUENTA_EFECTIVO],
          enlaces: [{ transactionId: 999, budgetId: 888 }],
        }),
      ),
      AHORA,
    );

    expect(datos.enlaces).toHaveLength(0);
    expect(datos.resumen.avisos.join(" ")).toMatch(/apuntaban a filas/);
  });

  it("descarta la transacción cuya cuenta no está en el archivo", () => {
    const datos = transformarExport(
      parseExportAndroid(
        archivo({
          cuentas: [CUENTA_EFECTIVO],
          transacciones: [
            {
              id: 100,
              amount: 10,
              type: "EXPENSE",
              categoryId: null,
              accountId: 42, // no existe
              transferAccountId: null,
              note: "",
              date: AHORA,
              isOutgoing: false,
            },
          ],
        }),
      ),
      AHORA,
    );

    expect(datos.transacciones).toHaveLength(0);
    expect(datos.resumen.avisos.join(" ")).toMatch(/incompletas/);
  });

  it("sustituye por valores válidos lo que venga corrupto", () => {
    const datos = transformarExport(
      parseExportAndroid(
        archivo({
          cuentas: [
            {
              id: 1,
              name: "Rara",
              type: "MARCIANA",
              initialBalance: "mucho",
              colorHex: "azul",
              iconName: "NoExiste",
              includeInTotal: "sí",
            },
          ],
          categorias: [
            {
              id: 10,
              name: "Rara",
              type: "OTRA_COSA",
              iconName: "Tampoco",
              colorHex: "#GGGGGG",
              isDefault: 1,
            },
          ],
          presupuestos: [
            {
              id: 7,
              name: "Raro",
              amount: 100,
              startDate: AHORA,
              endDate: AHORA,
              recurrence: "CADA_LUNA_LLENA",
            },
          ],
        }),
      ),
      AHORA,
    );

    // Nada de esto debe llegar a la base con un valor que el resto de la app no
    // sepa interpretar.
    expect(datos.cuentas[0]).toMatchObject({
      type: "CASH",
      initialBalance: 0,
      iconName: "Payments",
      includeInTotal: true,
    });
    expect(datos.cuentas[0]!.colorHex).toMatch(/^#[0-9A-F]{6}$/);
    expect(datos.categorias[0]).toMatchObject({ type: "EXPENSE", iconName: "Category" });
    expect(datos.categorias[0]!.colorHex).toMatch(/^#[0-9A-F]{6}$/);
    expect(datos.presupuestos[0]!.recurrence).toBe("NONE");
  });

  it("cuenta en el resumen lo que realmente entró", () => {
    const datos = transformarExport(
      parseExportAndroid(
        archivo({
          cuentas: [CUENTA_EFECTIVO, CUENTA_BANCO],
          categorias: [CATEGORIA_COMIDA],
          transacciones: [
            {
              id: 100,
              amount: 25,
              type: "EXPENSE",
              categoryId: 10,
              accountId: 1,
              transferAccountId: null,
              note: "",
              date: AHORA,
              isOutgoing: false,
            },
          ],
        }),
      ),
      AHORA,
    );

    expect(datos.resumen).toMatchObject({
      cuentas: 2,
      categorias: 1,
      transacciones: 1,
      presupuestos: 0,
      enlaces: 0,
    });
  });
});
