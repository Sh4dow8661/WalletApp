import { beforeEach, describe, expect, it } from "vitest";

import { zonedTime } from "../../src/lib/dates.ts";
import type { Account, Budget, Category } from "../../src/shared/types.ts";

import { type Cliente, crearUsuario, esperarEstado } from "./helpers.ts";

/**
 * Presupuestos que cuentan solos por categoría (§20).
 *
 * Lo que se prueba aquí es que la relación **persiste**, que el gasto es la
 * **unión** de las dos vías sin contar dos veces, y que un usuario no puede
 * colar la categoría de otro.
 */

const PR = "America/Puerto_Rico";
const enPR = (year: number, month: number, day: number, hour = 12) =>
  zonedTime({ year, month, day, hour }, PR);

/** Un mes cerrado y estable, para que los tests no dependan de hoy. */
const INICIO = enPR(2026, 8, 1, 0);
const FIN = enPR(2026, 8, 31, 23);

let cliente: Cliente;
let efectivo: Account;
let gasolina: Category;
let comida: Category;
let salario: Category;

const presupuestos = async () =>
  cliente.json<Budget[]>(await cliente.get("/api/budgets"));

const unPresupuesto = async (id: string) =>
  cliente.json<Budget>(await esperarEstado(await cliente.get(`/api/budgets/${id}`), 200));

async function crearPresupuesto(categoryIds: string[] = [], amount = 500) {
  const respuesta = await esperarEstado(
    await cliente.post("/api/budgets", {
      name: "Presupuesto E2E",
      amount,
      startDate: INICIO,
      endDate: FIN,
      // NONE: un único período fijo, para que no se mueva bajo los pies.
      recurrence: "NONE",
      categoryIds,
    }),
    201,
  );
  return (await cliente.json<{ id: string }>(respuesta)).id;
}

async function gastar(
  amount: number,
  categoryId: string | null,
  extra: Record<string, unknown> = {},
) {
  const respuesta = await esperarEstado(
    await cliente.post("/api/transactions", {
      amount,
      type: "EXPENSE",
      accountId: efectivo.id,
      categoryId,
      date: enPR(2026, 8, 15),
      ...extra,
    }),
    201,
  );
  return (await cliente.json<{ id: string }>(respuesta)).id;
}

beforeEach(async () => {
  cliente = await crearUsuario();
  const cuentas = await cliente.json<Account[]>(await cliente.get("/api/accounts"));
  efectivo = cuentas[0]!;

  const cats = await cliente.json<Category[]>(await cliente.get("/api/categories"));
  gasolina = cats.find((c) => c.name === "Transporte" && c.type === "EXPENSE")!;
  comida = cats.find((c) => c.name === "Comida" && c.type === "EXPENSE")!;
  salario = cats.find((c) => c.name === "Salario" && c.type === "INCOME")!;
});

describe("la relación persiste", () => {
  it("se guarda al crear y vuelve en el GET", async () => {
    const id = await crearPresupuesto([gasolina.id, comida.id]);
    const presupuesto = await unPresupuesto(id);

    expect(presupuesto.categoryIds.toSorted()).toEqual(
      [gasolina.id, comida.id].toSorted(),
    );
    expect(presupuesto.staleCategoryIds).toEqual([]);
  });

  it("se puede cambiar al editar", async () => {
    const id = await crearPresupuesto([gasolina.id]);

    await esperarEstado(
      await cliente.put(`/api/budgets/${id}`, {
        name: "Presupuesto E2E",
        amount: 500,
        startDate: INICIO,
        endDate: FIN,
        recurrence: "NONE",
        categoryIds: [comida.id],
      }),
      200,
    );

    expect((await unPresupuesto(id)).categoryIds).toEqual([comida.id]);
  });

  it("una lista vacía las quita todas", async () => {
    const id = await crearPresupuesto([gasolina.id]);
    await esperarEstado(
      await cliente.put(`/api/budgets/${id}`, {
        name: "Presupuesto E2E",
        amount: 500,
        startDate: INICIO,
        endDate: FIN,
        recurrence: "NONE",
        categoryIds: [],
      }),
      200,
    );

    expect((await unPresupuesto(id)).categoryIds).toEqual([]);
  });

  it("omitir el campo las deja como estaban", async () => {
    // Un cliente viejo que no conoce el campo no puede borrarlas sin querer.
    const id = await crearPresupuesto([gasolina.id]);
    await esperarEstado(
      await cliente.put(`/api/budgets/${id}`, {
        name: "Renombrado",
        amount: 700,
        startDate: INICIO,
        endDate: FIN,
        recurrence: "NONE",
      }),
      200,
    );

    const presupuesto = await unPresupuesto(id);
    expect(presupuesto.name).toBe("Renombrado");
    expect(presupuesto.categoryIds).toEqual([gasolina.id]);
  });

  it("borrar el presupuesto se lleva sus categorías", async () => {
    const id = await crearPresupuesto([gasolina.id]);
    await esperarEstado(await cliente.del(`/api/budgets/${id}`), 200);
    expect(await presupuestos()).toHaveLength(0);
  });
});

describe("el gasto cuenta solo", () => {
  it("sin enlazar nada a mano", async () => {
    await gastar(40, gasolina.id);
    const id = await crearPresupuesto([gasolina.id]);

    const presupuesto = await unPresupuesto(id);
    expect(presupuesto.spent).toBe(40);
    expect(presupuesto.spentFromCategories).toBe(40);
    expect(presupuesto.spentFromManual).toBe(0);
  });

  it("es RETROACTIVO: cuenta lo que ya estaba registrado", async () => {
    // Lo que pedía el punto 2: el gasto es anterior al presupuesto, y anterior
    // incluso a que la categoría se le asignase.
    await gastar(40, gasolina.id);
    const id = await crearPresupuesto([]);
    expect((await unPresupuesto(id)).spent).toBe(0);

    await esperarEstado(
      await cliente.put(`/api/budgets/${id}`, {
        name: "Presupuesto E2E",
        amount: 500,
        startDate: INICIO,
        endDate: FIN,
        recurrence: "NONE",
        categoryIds: [gasolina.id],
      }),
      200,
    );

    expect((await unPresupuesto(id)).spent).toBe(40);
  });

  it("la unión de las dos vías no cuenta dos veces", async () => {
    const id = await crearPresupuesto([gasolina.id]);
    // Este gasto es de la categoría Y además se enlaza a mano.
    await gastar(40, gasolina.id, { budgetIds: [id] });

    const presupuesto = await unPresupuesto(id);
    expect(presupuesto.spent).toBe(40);
    expect(presupuesto.spentFromCategories).toBe(40);
    expect(presupuesto.spentFromManual).toBe(0);
  });

  it("el enlace manual sigue sirviendo para lo que no es de la categoría", async () => {
    const id = await crearPresupuesto([gasolina.id]);
    await gastar(40, gasolina.id);
    await gastar(10, comida.id, { budgetIds: [id] });

    const presupuesto = await unPresupuesto(id);
    expect(presupuesto.spent).toBe(50);
    expect(presupuesto.spentFromCategories).toBe(40);
    expect(presupuesto.spentFromManual).toBe(10);
  });

  it("un ingreso en la categoría resta", async () => {
    const id = await crearPresupuesto([gasolina.id, salario.id]);
    await gastar(50, gasolina.id);
    await esperarEstado(
      await cliente.post("/api/transactions", {
        amount: 20,
        type: "INCOME",
        accountId: efectivo.id,
        categoryId: salario.id,
        date: enPR(2026, 8, 16),
      }),
      201,
    );

    expect((await unPresupuesto(id)).spent).toBe(30);
  });

  it("una transferencia no cuenta ni con la categoría puesta", async () => {
    const otra = await cliente.json<{ id: string }>(
      await esperarEstado(
        await cliente.post("/api/accounts", {
          name: "Destino",
          type: "BANK",
          balance: 0,
          colorHex: "#2196F3",
          iconName: "AccountBalance",
          includeInTotal: true,
        }),
        201,
      ),
    );

    const id = await crearPresupuesto([gasolina.id]);
    await esperarEstado(
      await cliente.post("/api/transactions", {
        amount: 500,
        type: "TRANSFER",
        accountId: efectivo.id,
        transferAccountId: otra.id,
        categoryId: gasolina.id,
        date: enPR(2026, 8, 17),
      }),
      201,
    );

    expect((await unPresupuesto(id)).spent).toBe(0);
  });

  it("lo de fuera del período no cuenta", async () => {
    const id = await crearPresupuesto([gasolina.id]);
    await gastar(40, gasolina.id, { date: enPR(2026, 9, 5) });
    expect((await unPresupuesto(id)).spent).toBe(0);
  });

  it("un gasto borrado deja de contar", async () => {
    const id = await crearPresupuesto([gasolina.id]);
    const txId = await gastar(40, gasolina.id);
    expect((await unPresupuesto(id)).spent).toBe(40);

    await esperarEstado(await cliente.del(`/api/transactions/${txId}`), 200);
    expect((await unPresupuesto(id)).spent).toBe(0);
  });
});

describe("categoría borrada", () => {
  it("el presupuesto no se rompe: avisa con staleCategoryIds", async () => {
    const id = await crearPresupuesto([gasolina.id]);
    await gastar(40, gasolina.id);
    expect((await unPresupuesto(id)).spent).toBe(40);

    await esperarEstado(await cliente.del(`/api/categories/${gasolina.id}`), 200);

    const presupuesto = await unPresupuesto(id);
    // El vínculo sigue ahí y marcado como huérfano: es lo que permite avisar
    // en vez de quedarse mudo.
    expect(presupuesto.categoryIds).toContain(gasolina.id);
    expect(presupuesto.staleCategoryIds).toContain(gasolina.id);
    // Y el gasto cae, porque el API deja las transacciones sin categoría.
    expect(presupuesto.spent).toBe(0);
  });

  it("lo enlazado a mano sobrevive al borrado de la categoría", async () => {
    const id = await crearPresupuesto([gasolina.id]);
    await gastar(40, gasolina.id, { budgetIds: [id] });

    await esperarEstado(await cliente.del(`/api/categories/${gasolina.id}`), 200);

    const presupuesto = await unPresupuesto(id);
    expect(presupuesto.spent).toBe(40);
    expect(presupuesto.spentFromManual).toBe(40);
  });
});

describe("seguridad y validación", () => {
  it("no se puede usar la categoría de otro usuario", async () => {
    const ajena = gasolina.id;
    const otroCliente = await crearUsuario();

    const respuesta = await otroCliente.post("/api/budgets", {
      name: "Intruso",
      amount: 100,
      startDate: INICIO,
      endDate: FIN,
      recurrence: "NONE",
      categoryIds: [ajena],
    });

    expect(respuesta.status).toBe(400);
    expect(
      await otroCliente.json<{ fields: Record<string, string> }>(respuesta),
    ).toHaveProperty("fields.categoryIds");
  });

  it("tampoco al editar", async () => {
    const ajena = gasolina.id;
    const otroCliente = await crearUsuario();
    const suyo = await cliente.json<{ id: string }>(
      await esperarEstado(
        await otroCliente.post("/api/budgets", {
          name: "Suyo",
          amount: 100,
          startDate: INICIO,
          endDate: FIN,
          recurrence: "NONE",
        }),
        201,
      ),
    );

    const respuesta = await otroCliente.put(`/api/budgets/${suyo.id}`, {
      name: "Suyo",
      amount: 100,
      startDate: INICIO,
      endDate: FIN,
      recurrence: "NONE",
      categoryIds: [ajena],
    });
    expect(respuesta.status).toBe(400);
  });

  it("rechaza una categoría inexistente", async () => {
    const respuesta = await cliente.post("/api/budgets", {
      name: "Fantasma",
      amount: 100,
      startDate: INICIO,
      endDate: FIN,
      recurrence: "NONE",
      categoryIds: ["01999999-9999-7999-8999-999999999999"],
    });
    expect(respuesta.status).toBe(400);
  });

  it("el gasto de otro usuario no se cuela en mi presupuesto", async () => {
    const id = await crearPresupuesto([gasolina.id]);
    await gastar(40, gasolina.id);

    const otroCliente = await crearUsuario();
    const suyas = await otroCliente.json<Account[]>(
      await otroCliente.get("/api/accounts"),
    );
    const susCats = await otroCliente.json<Category[]>(
      await otroCliente.get("/api/categories"),
    );
    await esperarEstado(
      await otroCliente.post("/api/transactions", {
        amount: 999,
        type: "EXPENSE",
        accountId: suyas[0]!.id,
        categoryId: susCats.find((c) => c.name === "Transporte")!.id,
        date: enPR(2026, 8, 15),
      }),
      201,
    );

    expect((await unPresupuesto(id)).spent).toBe(40);
  });
});

describe("copia de seguridad", () => {
  it("el export se lleva la relación y el import la restaura", async () => {
    const id = await crearPresupuesto([gasolina.id, comida.id]);
    await gastar(40, gasolina.id);

    const copia = await cliente.json<{
      presupuestoCategorias: { budgetId: number; categoryId: number }[];
    }>(await esperarEstado(await cliente.get("/api/data/json"), 200));

    expect(copia.presupuestoCategorias).toHaveLength(2);

    // Se restaura sobre el mismo usuario: importar reemplaza todo.
    await esperarEstado(
      await cliente.postRaw("/api/data/json", JSON.stringify(copia), "application/json"),
      200,
    );

    const restaurados = await presupuestos();
    expect(restaurados).toHaveLength(1);
    expect(restaurados[0]!.categoryIds).toHaveLength(2);
    // Y el automatismo sigue funcionando tras restaurar.
    expect(restaurados[0]!.spent).toBe(40);
    expect(id).toBeTruthy();
  });

  it("un respaldo viejo sin la sección nueva sigue importando", async () => {
    const id = await crearPresupuesto([gasolina.id]);
    const copia = await cliente.json<Record<string, unknown>>(
      await esperarEstado(await cliente.get("/api/data/json"), 200),
    );

    // Así son los respaldos anteriores a la 0005 y los de la app Android.
    delete copia.presupuestoCategorias;

    await esperarEstado(
      await cliente.postRaw("/api/data/json", JSON.stringify(copia), "application/json"),
      200,
    );

    const restaurados = await presupuestos();
    expect(restaurados).toHaveLength(1);
    // Sin la sección, el presupuesto entra sin categorías: se pierde el
    // automatismo, no el presupuesto.
    expect(restaurados[0]!.categoryIds).toEqual([]);
    expect(id).toBeTruthy();
  });
});
