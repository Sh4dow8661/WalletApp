import type { TransactionType } from "@/shared/constants.ts";

/**
 * Gasto de un presupuesto: cuánto se lleva consumido del período.
 *
 * ## Las dos vías, y por qué son dos
 *
 * Un movimiento cuenta en un presupuesto si cumple **cualquiera** de estas:
 *
 * 1. **Por categoría** — su categoría es una de las que alimentan el
 *    presupuesto. Es automático: no hay que acordarse de nada.
 * 2. **Por enlace manual** — se enlazó a mano a ese presupuesto. Sirve para el
 *    gasto suelto que no es de esas categorías pero que se quiere imputar
 *    igual.
 *
 * Lo que cuenta es la **unión** de ambas, y un movimiento que esté en las dos
 * **cuenta una sola vez**. La app Android tenía solo la vía 1 y la perdió en
 * MIGRATION_4_5; aquí vuelve sin quitar la 2 (§20).
 *
 * ## El signo
 *
 * `EXPENSE` suma y `INCOME` resta, que es la regla que ya había (§8.4): un
 * ingreso o una devolución dentro de la categoría devuelve saldo al
 * presupuesto.
 *
 * ## Las transferencias no cuentan NUNCA
 *
 * Ni la pata que sale ni la que entra, tengan la categoría que tengan. Mover
 * dinero entre cuentas propias no es gastar, y contarlo inflaría el
 * presupuesto por las dos puntas. En la práctica una transferencia no lleva
 * categoría (§8.2), pero se filtra explícitamente por tipo para que la regla no
 * dependa de ese detalle.
 */

/** Lo mínimo que hace falta de un movimiento para imputarlo. */
export interface MovimientoImputable {
  id: string;
  type: TransactionType;
  amount: number;
  date: number;
  categoryId: string | null;
  /**
   * Borrado lógico. La consulta ya lo filtra, pero se respeta también aquí:
   * que un movimiento borrado no pueda colarse en un presupuesto no debe
   * depender de que quien llame se acuerde de filtrarlo.
   */
  deletedAt?: number | null;
}

export interface PeriodoPresupuesto {
  start: number;
  end: number;
}

export interface DesgloseGasto {
  /** Neto del período: gastos menos ingresos, por las dos vías, sin repetir. */
  spent: number;
  /** Parte que entró por categoría. */
  spentFromCategories: number;
  /**
   * Parte que entró **solo** por enlace manual.
   *
   * Un movimiento que además cae en una categoría del presupuesto se imputa al
   * lado de categoría y no aquí, para que `spentFromCategories +
   * spentFromManual` sea exactamente `spent` y los dos números que se enseñan
   * sumen lo que se ve arriba.
   */
  spentFromManual: number;
  countFromCategories: number;
  countFromManual: number;
}

const VACIO: DesgloseGasto = {
  spent: 0,
  spentFromCategories: 0,
  spentFromManual: 0,
  countFromCategories: 0,
  countFromManual: 0,
};

/**
 * Cuánto aporta un movimiento: el gasto suma, el ingreso resta, la
 * transferencia nada.
 */
function delta(movimiento: MovimientoImputable): number {
  if (movimiento.type === "EXPENSE") return movimiento.amount;
  if (movimiento.type === "INCOME") return -movimiento.amount;
  return 0;
}

/** ¿Cuenta este movimiento en el presupuesto, y por qué vía? */
function cuenta(
  movimiento: MovimientoImputable,
  categoryIds: ReadonlySet<string>,
  enlazados: ReadonlySet<string>,
): "categoria" | "manual" | null {
  if (movimiento.deletedAt !== undefined && movimiento.deletedAt !== null) return null;
  // Las transferencias se descartan antes que nada: da igual por qué vía
  // llegasen, no son gasto.
  if (movimiento.type === "TRANSFER") return null;
  if (movimiento.categoryId !== null && categoryIds.has(movimiento.categoryId)) {
    return "categoria";
  }
  return enlazados.has(movimiento.id) ? "manual" : null;
}

/**
 * Calcula el gasto de un presupuesto en su período.
 *
 * `movimientos` debe venir ya filtrado por usuario y sin los borrados
 * lógicamente: esta función no sabe de sesiones ni de `deleted_at`. Sí filtra
 * por período, por tipo y por las dos vías de imputación.
 *
 * Los duplicados en `movimientos` (el mismo id repetido, que es lo que sale al
 * juntar la consulta de categorías con la de enlaces) se ignoran: cada id se
 * cuenta una sola vez.
 */
export function budgetSpend(
  movimientos: readonly MovimientoImputable[],
  periodo: PeriodoPresupuesto,
  categoryIds: ReadonlySet<string>,
  enlazados: ReadonlySet<string>,
): DesgloseGasto {
  if (movimientos.length === 0) return { ...VACIO };

  const vistos = new Set<string>();
  const resultado: DesgloseGasto = { ...VACIO };

  for (const movimiento of movimientos) {
    if (vistos.has(movimiento.id)) continue;
    if (movimiento.date < periodo.start || movimiento.date > periodo.end) continue;

    const via = cuenta(movimiento, categoryIds, enlazados);
    if (via === null) continue;

    vistos.add(movimiento.id);
    const aporte = delta(movimiento);
    resultado.spent += aporte;

    if (via === "categoria") {
      resultado.spentFromCategories += aporte;
      resultado.countFromCategories += 1;
    } else {
      resultado.spentFromManual += aporte;
      resultado.countFromManual += 1;
    }
  }

  return resultado;
}
