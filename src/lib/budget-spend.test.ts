import { describe, expect, it } from "vitest";

import { type MovimientoImputable, budgetSpend } from "./budget-spend.ts";
import { dateInputToMillis } from "./dates.ts";

const TZ = "America/Puerto_Rico";
const dia = (iso: string) => dateInputToMillis(iso, TZ);

/** Período de agosto de 2026, que es el que usan casi todos los casos. */
const AGOSTO = { start: dia("2026-08-01"), end: dia("2026-08-31") + 86_399_999 };

const GASOLINA = "cat-gasolina";
const COMIDA = "cat-comida";

let contador = 0;
const mov = (
  campos: Partial<MovimientoImputable> & { amount: number },
): MovimientoImputable => ({
  id: `tx-${++contador}`,
  type: "EXPENSE",
  date: dia("2026-08-15"),
  categoryId: GASOLINA,
  ...campos,
});

const conjunto = (...ids: string[]) => new Set(ids);

describe("solo por categoría", () => {
  it("suma todo lo gastado en la categoría sin enlazar nada", () => {
    const r = budgetSpend(
      [mov({ amount: 30 }), mov({ amount: 20 })],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(),
    );

    expect(r.spent).toBe(50);
    expect(r.spentFromCategories).toBe(50);
    expect(r.spentFromManual).toBe(0);
    expect(r.countFromCategories).toBe(2);
  });

  it("ignora lo de otras categorías", () => {
    const r = budgetSpend(
      [mov({ amount: 30 }), mov({ amount: 999, categoryId: COMIDA })],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(),
    );
    expect(r.spent).toBe(30);
  });

  it("varias categorías alimentan el mismo presupuesto", () => {
    const r = budgetSpend(
      [mov({ amount: 30 }), mov({ amount: 20, categoryId: COMIDA })],
      AGOSTO,
      conjunto(GASOLINA, COMIDA),
      conjunto(),
    );
    expect(r.spent).toBe(50);
  });

  it("un movimiento sin categoría no entra por esta vía", () => {
    const r = budgetSpend(
      [mov({ amount: 30, categoryId: null })],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(),
    );
    expect(r.spent).toBe(0);
  });
});

describe("solo por enlace manual", () => {
  it("cuenta lo enlazado aunque no sea de ninguna categoría del presupuesto", () => {
    const suelto = mov({ amount: 40, categoryId: COMIDA });
    const r = budgetSpend([suelto], AGOSTO, conjunto(GASOLINA), conjunto(suelto.id));

    expect(r.spent).toBe(40);
    expect(r.spentFromManual).toBe(40);
    expect(r.spentFromCategories).toBe(0);
    expect(r.countFromManual).toBe(1);
  });

  it("sigue funcionando con el presupuesto sin categorías, como antes de la 0005", () => {
    const enlazado = mov({ amount: 25, categoryId: null });
    const r = budgetSpend([enlazado], AGOSTO, conjunto(), conjunto(enlazado.id));
    expect(r.spent).toBe(25);
  });
});

describe("las dos vías a la vez", () => {
  it("un movimiento que está en las dos cuenta UNA sola vez", () => {
    // Es el caso que justifica la deduplicación: el gasto es de la categoría y
    // además quedó enlazado a mano de antes.
    const ambas = mov({ amount: 30 });
    const r = budgetSpend([ambas], AGOSTO, conjunto(GASOLINA), conjunto(ambas.id));

    expect(r.spent).toBe(30);
    expect(r.countFromCategories).toBe(1);
    expect(r.countFromManual).toBe(0);
  });

  it("el mismo movimiento repetido en la lista no se cuenta dos veces", () => {
    // Al juntar la consulta de categorías con la de enlaces, la misma fila
    // llega dos veces. No puede inflar el gasto.
    const repetido = mov({ amount: 30 });
    const r = budgetSpend(
      [repetido, repetido],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(repetido.id),
    );
    expect(r.spent).toBe(30);
  });

  it("los dos desgloses suman exactamente el total", () => {
    const porCategoria = mov({ amount: 30 });
    const aMano = mov({ amount: 40, categoryId: COMIDA });
    const r = budgetSpend(
      [porCategoria, aMano],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(aMano.id),
    );

    expect(r.spent).toBe(70);
    expect(r.spentFromCategories + r.spentFromManual).toBe(r.spent);
  });
});

describe("el signo", () => {
  it("un ingreso en la categoría RESTA, como un reembolso", () => {
    const r = budgetSpend(
      [mov({ amount: 50 }), mov({ amount: 20, type: "INCOME" })],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(),
    );
    expect(r.spent).toBe(30);
  });

  it("una devolución mayor que el gasto deja el neto en negativo", () => {
    const r = budgetSpend(
      [mov({ amount: 10 }), mov({ amount: 30, type: "INCOME" })],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(),
    );
    expect(r.spent).toBe(-20);
  });
});

describe("las transferencias no cuentan nunca", () => {
  it("ni aunque lleven la categoría del presupuesto", () => {
    const r = budgetSpend(
      [mov({ amount: 500, type: "TRANSFER" })],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(),
    );
    expect(r.spent).toBe(0);
    expect(r.countFromCategories).toBe(0);
  });

  it("ni aunque estén enlazadas a mano", () => {
    const pata = mov({ amount: 500, type: "TRANSFER", categoryId: null });
    const r = budgetSpend([pata], AGOSTO, conjunto(), conjunto(pata.id));
    expect(r.spent).toBe(0);
  });

  it("las dos patas juntas siguen sin mover el presupuesto", () => {
    const r = budgetSpend(
      [
        mov({ amount: 500, type: "TRANSFER" }),
        mov({ amount: 500, type: "TRANSFER" }),
        mov({ amount: 30 }),
      ],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(),
    );
    expect(r.spent).toBe(30);
  });
});

describe("qué queda fuera", () => {
  it("lo anterior al período", () => {
    const r = budgetSpend(
      [mov({ amount: 99, date: dia("2026-07-31") })],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(),
    );
    expect(r.spent).toBe(0);
  });

  it("lo posterior al período", () => {
    const r = budgetSpend(
      [mov({ amount: 99, date: dia("2026-09-01") })],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(),
    );
    expect(r.spent).toBe(0);
  });

  it("los bordes del período sí entran", () => {
    const r = budgetSpend(
      [mov({ amount: 10, date: AGOSTO.start }), mov({ amount: 5, date: AGOSTO.end })],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(),
    );
    expect(r.spent).toBe(15);
  });

  it("un movimiento borrado, aunque la consulta se olvidara de filtrarlo", () => {
    const r = budgetSpend(
      [mov({ amount: 99, deletedAt: dia("2026-08-20") })],
      AGOSTO,
      conjunto(GASOLINA),
      conjunto(),
    );
    expect(r.spent).toBe(0);
  });

  it("un borrado enlazado a mano tampoco cuenta", () => {
    const borrado = mov({ amount: 99, deletedAt: dia("2026-08-20") });
    const r = budgetSpend([borrado], AGOSTO, conjunto(), conjunto(borrado.id));
    expect(r.spent).toBe(0);
  });
});

describe("categoría borrada", () => {
  /*
   * Al borrar una categoría, el API deja a cero el `category_id` de sus
   * transacciones (ver `routes/categories.ts`). O sea que el presupuesto deja
   * de verlas: no es que el cálculo las descarte, es que ya no son de esa
   * categoría. Por eso el presupuesto conserva el vínculo y la UI avisa, en vez
   * de quedarse callado — ver `staleCategoryIds`.
   */
  it("el vínculo sobrevive pero ya no casa nada, y el gasto se va a cero", () => {
    const huerfano = mov({ amount: 40, categoryId: null });
    const r = budgetSpend([huerfano], AGOSTO, conjunto(GASOLINA), conjunto());
    expect(r.spent).toBe(0);
  });

  it("lo que estuviera enlazado a mano SÍ se conserva", () => {
    // La red de seguridad: si el gasto estaba además enlazado, borrar la
    // categoría no se lo lleva por delante.
    const huerfano = mov({ amount: 40, categoryId: null });
    const r = budgetSpend([huerfano], AGOSTO, conjunto(GASOLINA), conjunto(huerfano.id));
    expect(r.spent).toBe(40);
    expect(r.spentFromManual).toBe(40);
  });
});

describe("casos vacíos", () => {
  it("sin movimientos, todo a cero", () => {
    const r = budgetSpend([], AGOSTO, conjunto(GASOLINA), conjunto());
    expect(r).toEqual({
      spent: 0,
      spentFromCategories: 0,
      spentFromManual: 0,
      countFromCategories: 0,
      countFromManual: 0,
    });
  });

  it("sin categorías ni enlaces, nada cuenta", () => {
    const r = budgetSpend([mov({ amount: 30 })], AGOSTO, conjunto(), conjunto());
    expect(r.spent).toBe(0);
  });
});
