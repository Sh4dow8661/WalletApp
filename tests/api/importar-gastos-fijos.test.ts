import { beforeEach, describe, expect, it } from "vitest";

import { dateInputToMillis, millisToDateInput } from "../../src/lib/dates.ts";
import { monthlyEquivalent } from "../../src/lib/gastos-fijos.ts";
import { parsePastedFixedExpenses } from "../../src/lib/importar-gastos-fijos.ts";
import { roundToCents } from "../../src/lib/money.ts";
import type {
  Account,
  Category,
  FixedExpense,
  FixedExpenseImportResult,
} from "../../src/shared/types.ts";

import { type Cliente, crearUsuario, esperarEstado } from "./helpers.ts";

/**
 * Importación de gastos fijos por pegado.
 *
 * Lo que de verdad se prueba aquí es que **volver a pegar la misma hoja no
 * duplica nada** y que no pisa el trabajo que el Excel no puede reponer: la
 * fecha del próximo pago y la cuenta de la que sale el dinero.
 */

const TZ = "America/Puerto_Rico";
const dia = (iso: string) => dateInputToMillis(iso, TZ);
const comoIso = (millis: number) => millisToDateInput(millis, TZ);

/** La hoja real del usuario, tal cual la copiaría de Excel. */
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

let cliente: Cliente;
let efectivo: Account;

const gastosFijos = async () =>
  cliente.json<FixedExpense[]>(await cliente.get("/api/fixed-expenses"));
const categorias = async () =>
  cliente.json<Category[]>(await cliente.get("/api/categories"));

/** Manda a importar lo que salga de leer un texto pegado. */
async function importar(
  texto: string,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  const { rows } = parsePastedFixedExpenses(texto);
  return cliente.post("/api/fixed-expenses/import", {
    items: rows.map((f) => ({
      name: f.name,
      amount: f.amount,
      everyMonths: f.everyMonths,
      categoryName: f.categoryName,
    })),
    defaultNextDueDate: dia("2026-09-01"),
    ...extra,
  });
}

beforeEach(async () => {
  cliente = await crearUsuario();
  const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));
  efectivo = cuentas[0]!;
});

describe("cargar la hoja del usuario", () => {
  it("crea los 13 gastos y da exactamente 556,25 al mes", async () => {
    const salida = await cliente.json<FixedExpenseImportResult>(
      await esperarEstado(await importar(HOJA_DEL_USUARIO), 200),
    );

    expect(salida.created).toBe(13);
    expect(salida.updated).toBe(0);

    const lista = await gastosFijos();
    expect(lista).toHaveLength(13);

    const total = lista.reduce((suma, g) => suma + monthlyEquivalent(g), 0);
    expect(roundToCents(total)).toBe(556.25);
  });

  it("crea solo las categorías que faltaban", async () => {
    const salida = await cliente.json<FixedExpenseImportResult>(
      await esperarEstado(await importar(HOJA_DEL_USUARIO), 200),
    );

    // Transporte, Entretenimiento y Salud ya vienen de la siembra del registro;
    // las otras cuatro hay que crearlas.
    expect(salida.createdCategories.toSorted()).toEqual([
      "Alimentación",
      "Hogar",
      "Personal",
      "Tecnología",
    ]);

    const cats = await categorias();
    const gasto = cats.filter((c) => c.type === "EXPENSE").map((c) => c.name);
    for (const nombre of ["Tecnología", "Transporte", "Salud", "Hogar"]) {
      expect(gasto).toContain(nombre);
    }
    // Y no ha duplicado las que ya estaban.
    expect(gasto.filter((n) => n === "Transporte")).toHaveLength(1);
  });

  it("enlaza cada gasto con su categoría", async () => {
    await esperarEstado(await importar(HOJA_DEL_USUARIO), 200);

    const cats = await categorias();
    const tecnologia = cats.find((c) => c.name === "Tecnología")!;
    const lista = await gastosFijos();

    expect(lista.find((g) => g.name === "Claude Max")!.categoryId).toBe(tecnologia.id);
    expect(lista.filter((g) => g.categoryId === tecnologia.id)).toHaveLength(5);
  });

  it("aplica la fecha y la cuenta por defecto a los gastos nuevos", async () => {
    await esperarEstado(
      await importar(HOJA_DEL_USUARIO, { defaultAccountId: efectivo.id }),
      200,
    );

    const lista = await gastosFijos();
    for (const gasto of lista) {
      expect(comoIso(gasto.nextDueDate)).toBe("2026-09-01");
      expect(gasto.accountId).toBe(efectivo.id);
      expect(gasto.anchorDay).toBe(1);
      expect(gasto.isActive).toBe(true);
    }
  });
});

describe("idempotencia", () => {
  it("volver a pegar la misma hoja actualiza y no duplica", async () => {
    await esperarEstado(await importar(HOJA_DEL_USUARIO), 200);

    const salida = await cliente.json<FixedExpenseImportResult>(
      await esperarEstado(await importar(HOJA_DEL_USUARIO), 200),
    );

    expect(salida.created).toBe(0);
    expect(salida.updated).toBe(13);
    expect(salida.createdCategories).toEqual([]);
    expect(await gastosFijos()).toHaveLength(13);
  });

  it("reconoce el gasto aunque el Excel cambie acentos o mayúsculas", async () => {
    await esperarEstado(await importar("Teléfono\tTecnología\t$45.00\t1"), 200);

    const salida = await cliente.json<FixedExpenseImportResult>(
      await esperarEstado(await importar("TELEFONO\tTecnología\t$48.00\t1"), 200),
    );

    expect(salida.updated).toBe(1);
    const lista = await gastosFijos();
    expect(lista).toHaveLength(1);
    expect(lista[0]!.amount).toBe(48);
    // Se queda con la grafía de la última hoja pegada.
    expect(lista[0]!.name).toBe("TELEFONO");
  });

  it("una subida de precio en el Excel se refleja al re-importar", async () => {
    await esperarEstado(await importar("Internet\tTecnología\t$50.00\t1"), 200);
    await esperarEstado(await importar("Internet\tTecnología\t$65.00\t1"), 200);

    const lista = await gastosFijos();
    expect(lista).toHaveLength(1);
    expect(lista[0]!.amount).toBe(65);
  });

  it("NO pisa la fecha ni la cuenta que se configuraron a mano", async () => {
    // Es el caso que justifica todo el diseño del endpoint: el Excel no tiene
    // estos dos datos, así que re-pegarlo no puede borrarlos.
    await esperarEstado(
      await importar("Marbete\tTransporte\t$200.00\t12", {
        defaultAccountId: efectivo.id,
      }),
      200,
    );

    const [antes] = await gastosFijos();
    await esperarEstado(
      await cliente.put(`/api/fixed-expenses/${antes!.id}`, {
        name: antes!.name,
        amount: antes!.amount,
        everyMonths: antes!.everyMonths,
        nextDueDate: dia("2027-02-28"),
        accountId: efectivo.id,
        categoryId: antes!.categoryId,
        isActive: false,
        note: "el marbete vence en febrero",
      }),
      200,
    );

    // Ahora sube el precio en el Excel y se vuelve a pegar.
    await esperarEstado(
      await importar("Marbete\tTransporte\t$220.00\t12", { defaultAccountId: null }),
      200,
    );

    const [despues] = await gastosFijos();
    expect(despues!.amount).toBe(220);
    // Lo que el Excel no sabe se queda como estaba.
    expect(comoIso(despues!.nextDueDate)).toBe("2027-02-28");
    expect(despues!.accountId).toBe(efectivo.id);
    expect(despues!.isActive).toBe(false);
    expect(despues!.note).toBe("el marbete vence en febrero");
  });

  it("un gasto borrado no se resucita: se crea uno nuevo", async () => {
    await esperarEstado(await importar("Internet\tTecnología\t$50.00\t1"), 200);
    const [creado] = await gastosFijos();
    await esperarEstado(await cliente.del(`/api/fixed-expenses/${creado!.id}`), 200);

    const salida = await cliente.json<FixedExpenseImportResult>(
      await esperarEstado(await importar("Internet\tTecnología\t$50.00\t1"), 200),
    );

    expect(salida.created).toBe(1);
    const lista = await gastosFijos();
    expect(lista).toHaveLength(1);
    expect(lista[0]!.id).not.toBe(creado!.id);
  });
});

describe("validación", () => {
  it("rechaza la lista vacía", async () => {
    const respuesta = await cliente.post("/api/fixed-expenses/import", {
      items: [],
      defaultNextDueDate: dia("2026-09-01"),
    });
    expect(respuesta.status).toBe(400);
  });

  it("rechaza un importe que no sea positivo y dice qué fila falla", async () => {
    const respuesta = await cliente.post("/api/fixed-expenses/import", {
      items: [
        { name: "Bueno", amount: 10, everyMonths: 1 },
        { name: "Malo", amount: 0, everyMonths: 1 },
      ],
      defaultNextDueDate: dia("2026-09-01"),
    });

    expect(respuesta.status).toBe(400);
    const cuerpo = await cliente.json<{ fields: Record<string, string> }>(respuesta);
    expect(Object.keys(cuerpo.fields)).toContain("items.1.amount");

    // Y no ha entrado nada: la validación va antes que cualquier escritura.
    expect(await gastosFijos()).toHaveLength(0);
  });

  it("rechaza una periodicidad fuera del rango del esquema", async () => {
    const respuesta = await cliente.post("/api/fixed-expenses/import", {
      items: [{ name: "Siglo", amount: 10, everyMonths: 121 }],
      defaultNextDueDate: dia("2026-09-01"),
    });
    expect(respuesta.status).toBe(400);
  });

  it("no admite más de 200 filas", async () => {
    const respuesta = await cliente.post("/api/fixed-expenses/import", {
      items: Array.from({ length: 201 }, (_, i) => ({
        name: `Gasto ${i}`,
        amount: 10,
        everyMonths: 1,
      })),
      defaultNextDueDate: dia("2026-09-01"),
    });
    expect(respuesta.status).toBe(400);
  });

  it("una fila sin categoría entra sin ella, no falla", async () => {
    await esperarEstado(await importar("Internet\t50\t1"), 200);
    const lista = await gastosFijos();
    expect(lista[0]!.categoryId).toBeNull();
  });
});

describe("aislamiento entre usuarios", () => {
  it("no toca los gastos de otro usuario con el mismo nombre", async () => {
    await esperarEstado(await importar("Internet\tTecnología\t$50.00\t1"), 200);

    const otro = cliente;
    cliente = await crearUsuario();
    await esperarEstado(await importar("Internet\tTecnología\t$99.00\t1"), 200);

    const suyos = await cliente.json<FixedExpense[]>(
      await cliente.get("/api/fixed-expenses"),
    );
    expect(suyos).toHaveLength(1);
    expect(suyos[0]!.amount).toBe(99);

    cliente = otro;
    const originales = await gastosFijos();
    expect(originales).toHaveLength(1);
    expect(originales[0]!.amount).toBe(50);
  });
});
