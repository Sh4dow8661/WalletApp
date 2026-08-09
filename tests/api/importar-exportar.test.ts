import { beforeEach, describe, expect, it } from "vitest";

import { CSV_HEADER } from "../../src/lib/csv.ts";
import type { ResumenImportacion } from "../../src/lib/import-json.ts";
import type { Account, Budget, Category, Transaction } from "../../src/shared/types.ts";

import { type Cliente, crearUsuario, esperarEstado } from "./helpers.ts";

/**
 * Importación y exportación de datos (§12), contra la D1 real.
 *
 * Lo importante aquí es el viaje completo: que exportar y volver a importar deje
 * la base como estaba, que las transferencias conserven su dirección y que un
 * archivo malo no se lleve por delante los datos que ya había.
 */

let cliente: Cliente;

const cuentas = async () => cliente.json<Account[]>(await cliente.get("/api/accounts"));
const categorias = async () =>
  cliente.json<Category[]>(await cliente.get("/api/categories"));
const movimientos = async () =>
  cliente.json<Transaction[]>(await cliente.get("/api/transactions"));
const presupuestos = async () => cliente.json<Budget[]>(await cliente.get("/api/budgets"));

const importarJson = (contenido: string) =>
  cliente.postRaw("/api/data/json", contenido, "application/json");
const importarCsv = (contenido: string) =>
  cliente.postRaw("/api/data/csv", contenido, "text/csv");

const AHORA = Date.now();

beforeEach(async () => {
  cliente = await crearUsuario();
});

/** Deja al usuario con un juego de datos completo: los cinco tipos de fila. */
async function sembrarDatos() {
  const [efectivo, banco] = await cuentas();
  const cats = await categorias();
  const comida = cats.find((c) => c.name === "Comida" && c.type === "EXPENSE")!;

  const { id: presupuestoId } = await cliente.json<{ id: string }>(
    await esperarEstado(
      await cliente.post("/api/budgets", {
        name: "Comida del mes",
        amount: 300,
        startDate: AHORA,
        endDate: AHORA + 86_400_000 * 30,
        recurrence: "MONTHLY",
      }),
      201,
    ),
  );

  // El enlace transacción↔presupuesto se hace desde la transacción (§8.4).
  const { id: gastoId } = await cliente.json<{ id: string }>(
    await esperarEstado(
      await cliente.post("/api/transactions", {
        amount: 25.5,
        type: "EXPENSE",
        accountId: efectivo!.id,
        categoryId: comida.id,
        note: "Almuerzo",
        date: AHORA,
        budgetIds: [presupuestoId],
      }),
      201,
    ),
  );

  await esperarEstado(
    await cliente.post("/api/transactions", {
      amount: 50,
      type: "TRANSFER",
      accountId: efectivo!.id,
      transferAccountId: banco!.id,
      date: AHORA,
    }),
    201,
  );

  return { efectivo: efectivo!, banco: banco!, comida, gastoId, presupuestoId };
}

describe("exportación", () => {
  it("el JSON lleva las cinco secciones con los datos del usuario", async () => {
    await sembrarDatos();

    const cuerpo = await cliente.json<{
      formato: string;
      version: number;
      cuentas: unknown[];
      categorias: unknown[];
      transacciones: { type: string; isOutgoing: boolean }[];
      presupuestos: unknown[];
      enlaces: unknown[];
    }>(await esperarEstado(await cliente.get("/api/data/json"), 200));

    expect(cuerpo.formato).toBe("walletapp-export");
    expect(cuerpo.version).toBe(1);
    expect(cuerpo.cuentas).toHaveLength(3); // las tres de la siembra
    expect(cuerpo.categorias).toHaveLength(14);
    expect(cuerpo.transacciones).toHaveLength(3); // gasto + las dos patas
    expect(cuerpo.presupuestos).toHaveLength(1);
    expect(cuerpo.enlaces).toHaveLength(1);

    // La dirección de la transferencia es justo lo que el CSV no guarda.
    const patas = cuerpo.transacciones.filter((t) => t.type === "TRANSFER");
    expect(patas.filter((t) => t.isOutgoing)).toHaveLength(1);
    expect(patas.filter((t) => !t.isOutgoing)).toHaveLength(1);
  });

  it("el CSV sale con la cabecera de la app Android y una línea por movimiento", async () => {
    await sembrarDatos();

    const respuesta = await esperarEstado(await cliente.get("/api/data/csv"), 200);
    expect(respuesta.headers.get("content-type")).toContain("text/csv");

    const lineas = (await respuesta.text()).trim().split("\n");
    expect(lineas[0]).toBe(CSV_HEADER);
    expect(lineas).toHaveLength(4); // cabecera + 3 movimientos
  });

  it("no deja ver los datos de otro usuario", async () => {
    await sembrarDatos();
    const otro = await crearUsuario();

    const cuerpo = await otro.json<{ transacciones: unknown[] }>(
      await otro.get("/api/data/json"),
    );
    // El otro usuario solo tiene su propia siembra: ninguna transacción.
    expect(cuerpo.transacciones).toHaveLength(0);
  });
});

describe("importación de JSON", () => {
  it("exportar e importar deja la base igual", async () => {
    const { presupuestoId } = await sembrarDatos();

    const antes = {
      cuentas: await cuentas(),
      categorias: await categorias(),
      movimientos: await movimientos(),
      presupuestos: await presupuestos(),
    };
    const copia = await (await cliente.get("/api/data/json")).text();

    const { resumen } = await cliente.json<{ resumen: ResumenImportacion }>(
      await esperarEstado(await importarJson(copia), 200),
    );

    expect(resumen).toMatchObject({
      cuentas: 3,
      categorias: 14,
      transacciones: 3,
      presupuestos: 1,
      enlaces: 1,
      transferenciasEmparejadas: 1,
      transferenciasHuerfanas: 0,
    });

    const despues = {
      cuentas: await cuentas(),
      categorias: await categorias(),
      movimientos: await movimientos(),
      presupuestos: await presupuestos(),
    };

    // Cambian los identificadores (son UUID nuevos) y las marcas de tiempo: el
    // formato de la app Android no lleva `createdAt` ni `updatedAt`, así que se
    // ponen las de la importación. Todo lo demás tiene que ser idéntico.
    const VOLATILES = ["id", "createdAt", "updatedAt"];
    const comparable = (filas: object[]) =>
      filas.map((fila) =>
        Object.fromEntries(
          Object.entries(fila).filter(([clave]) => !VOLATILES.includes(clave)),
        ),
      );

    expect(comparable(despues.cuentas)).toEqual(comparable(antes.cuentas));
    expect(comparable(despues.categorias)).toEqual(comparable(antes.categorias));
    expect(despues.movimientos).toHaveLength(antes.movimientos.length);
    expect(despues.presupuestos).toHaveLength(1);

    // El enlace con el presupuesto sobrevive: lo que se gastó sigue contando.
    const antesGastado = antes.presupuestos.find((p) => p.id === presupuestoId)!.spent;
    expect(antesGastado).toBeGreaterThan(0);
    expect(despues.presupuestos[0]!.spent).toBe(antesGastado);
  });

  it("los saldos cuadran después de importar", async () => {
    const { efectivo } = await sembrarDatos();
    const saldoAntes = (await cuentas()).find((c) => c.id === efectivo.id)!.currentBalance;

    const copia = await (await cliente.get("/api/data/json")).text();
    await esperarEstado(await importarJson(copia), 200);

    const efectivoDespues = (await cuentas()).find((c) => c.name === efectivo.name)!;
    expect(efectivoDespues.currentBalance).toBeCloseTo(saldoAntes, 6);
  });

  it("la transferencia sigue siendo editable como una sola cosa (§8.2)", async () => {
    const { banco } = await sembrarDatos();

    const copia = await (await cliente.get("/api/data/json")).text();
    await esperarEstado(await importarJson(copia), 200);

    const transferencia = (await movimientos()).find(
      (t) => t.type === "TRANSFER" && t.isOutgoing,
    )!;
    expect(transferencia.transferGroupId).not.toBeNull();

    const bancoDespues = (await cuentas()).find((c) => c.name === banco.name)!;
    await esperarEstado(
      await cliente.put(`/api/transactions/${transferencia.id}`, {
        amount: 80,
        type: "TRANSFER",
        accountId: transferencia.accountId,
        transferAccountId: bancoDespues.id,
        date: transferencia.date,
      }),
      200,
    );

    // Si el grupo se hubiera perdido en la importación, solo cambiaría una pata.
    const patas = (await movimientos()).filter((t) => t.type === "TRANSFER");
    expect(patas).toHaveLength(2);
    expect(patas.every((p) => p.amount === 80)).toBe(true);
  });

  it("reemplaza: lo que había antes desaparece", async () => {
    await sembrarDatos();

    const vacio = JSON.stringify({
      formato: "walletapp-export",
      version: 1,
      exportadoEn: AHORA,
      cuentas: [
        {
          id: 1,
          name: "Única",
          type: "CASH",
          initialBalance: 10,
          colorHex: "#66BB6A",
          iconName: "Payments",
          includeInTotal: true,
        },
      ],
      categorias: [],
      transacciones: [],
      presupuestos: [],
      enlaces: [],
    });

    await esperarEstado(await importarJson(vacio), 200);

    const lista = await cuentas();
    expect(lista).toHaveLength(1);
    expect(lista[0]!.name).toBe("Única");
    expect(await movimientos()).toHaveLength(0);
    expect(await categorias()).toHaveLength(0);
    expect(await presupuestos()).toHaveLength(0);
  });

  it("un archivo inválido se rechaza sin tocar nada", async () => {
    await sembrarDatos();
    const antes = await movimientos();

    const respuesta = await importarJson("{ esto no es un export }");
    expect(respuesta.status).toBe(400);

    expect(await movimientos()).toHaveLength(antes.length);
    expect(await cuentas()).toHaveLength(3);
  });

  it("un archivo de otra aplicación se rechaza con un mensaje claro", async () => {
    const respuesta = await importarJson(JSON.stringify({ hola: "mundo" }));
    expect(respuesta.status).toBe(400);

    const { error } = await cliente.json<{ error: string }>(respuesta);
    expect(error).toMatch(/no parece un export de WalletApp/);
  });

  it("un archivo sin cuentas se rechaza: dejaría la app inutilizable", async () => {
    const sinCuentas = JSON.stringify({
      formato: "walletapp-export",
      version: 1,
      cuentas: [],
      categorias: [],
      transacciones: [],
      presupuestos: [],
      enlaces: [],
    });

    const respuesta = await importarJson(sinCuentas);
    expect(respuesta.status).toBe(400);
    expect(await cuentas()).toHaveLength(3);
  });

  it("aguanta un archivo grande de una sola vez", async () => {
    // Este test cubre dos límites de D1 a la vez, los dos de 100 variables por
    // sentencia: el troceado del `INSERT` al importar, y la lectura posterior de
    // /api/transactions, que antes filtraba los enlaces con un `IN (...)` de
    // hasta 1000 identificadores y devolvía un 500 con más de 100 movimientos.
    const transacciones = Array.from({ length: 220 }, (_, i) => ({
      id: i + 1,
      amount: 10 + i,
      type: "EXPENSE",
      categoryId: null,
      accountId: 1,
      transferAccountId: null,
      note: `Movimiento ${i}`,
      date: AHORA - i * 3_600_000,
      isOutgoing: false,
    }));

    const grande = JSON.stringify({
      formato: "walletapp-export",
      version: 1,
      cuentas: [
        {
          id: 1,
          name: "Efectivo",
          type: "CASH",
          initialBalance: 0,
          colorHex: "#66BB6A",
          iconName: "Payments",
          includeInTotal: true,
        },
      ],
      categorias: [],
      transacciones,
      presupuestos: [],
      enlaces: [],
    });

    const { resumen } = await cliente.json<{ resumen: ResumenImportacion }>(
      await esperarEstado(await importarJson(grande), 200),
    );

    expect(resumen.transacciones).toBe(220);
    expect(await movimientos()).toHaveLength(220);
  });

  it("exige sesión", async () => {
    const { fetchSinSesion } = await import("./helpers.ts");
    const respuesta = await fetchSinSesion("/api/data/json", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(respuesta.status).toBe(401);
  });
});

describe("importación de CSV", () => {
  it("crea cuentas y categorías a partir de los nombres", async () => {
    const csv = [
      CSV_HEADER,
      "2026-08-01 10:00:00,EXPENSE,25.50,Comida,Efectivo,,Almuerzo",
      "2026-08-02 09:00:00,INCOME,1500.00,Salario,Banco,,Nómina",
    ].join("\n");

    const { resumen } = await cliente.json<{ resumen: ResumenImportacion }>(
      await esperarEstado(await importarCsv(csv), 200),
    );

    expect(resumen).toMatchObject({ cuentas: 2, categorias: 2, transacciones: 2 });

    const lista = await cuentas();
    expect(lista.map((c) => c.name).sort()).toEqual(["Banco", "Efectivo"]);

    const cats = await categorias();
    expect(cats.find((c) => c.name === "Salario")!.type).toBe("INCOME");
    expect(cats.find((c) => c.name === "Comida")!.type).toBe("EXPENSE");
  });

  it("reconstruye la transferencia y avisa de que la dirección es una suposición", async () => {
    const csv = [
      CSV_HEADER,
      "2026-08-01 10:00:00,TRANSFER,50.00,,Efectivo,Banco,",
      "2026-08-01 10:00:00,TRANSFER,50.00,,Banco,Efectivo,",
    ].join("\n");

    const { resumen } = await cliente.json<{ resumen: ResumenImportacion }>(
      await esperarEstado(await importarCsv(csv), 200),
    );

    expect(resumen.transferenciasEmparejadas).toBe(1);
    expect(resumen.avisos.join(" ")).toMatch(/no guarda cuál era la cuenta de salida/);

    const patas = (await movimientos()).filter((t) => t.type === "TRANSFER");
    expect(patas).toHaveLength(2);
    expect(patas[0]!.transferGroupId).toBe(patas[1]!.transferGroupId);
    expect(patas.filter((p) => p.isOutgoing)).toHaveLength(1);
  });

  it("dice lo que el CSV no puede traer", async () => {
    const csv = [CSV_HEADER, "2026-08-01 10:00:00,EXPENSE,25.50,Comida,Efectivo,,"].join(
      "\n",
    );

    const { resumen } = await cliente.json<{ resumen: ResumenImportacion }>(
      await esperarEstado(await importarCsv(csv), 200),
    );

    expect(resumen.presupuestos).toBe(0);
    expect(resumen.avisos.join(" ")).toMatch(/no incluye presupuestos/);
  });

  it("se salta las líneas ilegibles y las cuenta", async () => {
    const csv = [
      CSV_HEADER,
      "2026-08-01 10:00:00,EXPENSE,25.50,Comida,Efectivo,,Bien",
      "fecha-mala,EXPENSE,10,Comida,Efectivo,,Mal",
      "2026-08-02 10:00:00,MARCIANO,10,Comida,Efectivo,,Peor",
    ].join("\n");

    const { resumen } = await cliente.json<{ resumen: ResumenImportacion }>(
      await esperarEstado(await importarCsv(csv), 200),
    );

    expect(resumen.transacciones).toBe(1);
    expect(resumen.avisos.join(" ")).toMatch(/2 línea\(s\)/);
  });

  it("rechaza un archivo sin nada legible sin borrar lo que había", async () => {
    await sembrarDatos();

    const respuesta = await importarCsv("esto no es un csv en absoluto");
    expect(respuesta.status).toBe(400);
    expect(await movimientos()).toHaveLength(3);
  });
});
