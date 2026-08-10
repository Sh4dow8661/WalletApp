import { AlertTriangle, PieChart, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { dateInputToMillis, millisToDateInput } from "@/lib/dates.ts";
import { formatMoney, parseAmountInput } from "@/lib/money.ts";
import { BUDGET_RECURRENCES, BUDGET_RECURRENCE_LABELS } from "@/shared/constants.ts";
import type { Budget, Category } from "@/shared/types.ts";

import { ProgressBar } from "../components/domain.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, EmptyState, Skeleton } from "../components/ui/card.tsx";
import { SelectField, TextField } from "../components/ui/field.tsx";
import { ConfirmDialog } from "../components/ui/responsive-dialog.tsx";
import {
  useBudgets,
  useCategories,
  useDeleteBudget,
  useSaveBudget,
} from "../hooks/api.ts";
import { cn } from "../lib/cn.ts";
import { useDisplaySettings, useNow } from "../hooks/use-month.tsx";
import { useIdNuevo } from "../hooks/use-id-nuevo.ts";
import { ScreenHeader } from "../layouts/MobileLayout.tsx";
import { MasterDetail } from "../layouts/MasterDetail.tsx";
import { ApiRequestError } from "../lib/api.ts";

/**
 * Presupuestos. Réplica de `BudgetsScreen.kt`.
 *
 * La tarjeta destaca el **dinero restante**, no el gastado: así quedó la app
 * tras el commit a5f68ad y §8.4 pide respetarlo.
 */
export function BudgetsScreen() {
  const presupuestos = useBudgets();
  const categorias = useCategories();
  const { currency } = useDisplaySettings();
  const nombreDeCategoria = (id: string) =>
    categorias.data?.find((c) => c.id === id)?.name;

  const lista = (
    <div>
      <ScreenHeader
        title="Presupuestos"
        action={
          <Button asChild size="icon" variant="ghost" aria-label="Nuevo presupuesto">
            <Link to="/presupuestos/nuevo">
              <Plus />
            </Link>
          </Button>
        }
      />

      <div className="space-y-3 p-4">
        {presupuestos.isPending ? (
          <Skeleton className="h-40" />
        ) : presupuestos.data?.length === 0 ? (
          <Card>
            <EmptyState
              icon={PieChart}
              title="Sin presupuestos"
              description="Crea uno, elige sus categorías y lo que gastes en ellas contará solo."
              action={
                <Button asChild size="sm">
                  <Link to="/presupuestos/nuevo">Crear presupuesto</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          presupuestos.data?.map((b) => (
            <BudgetCard
              key={b.id}
              budget={b}
              currency={currency}
              nombreDeCategoria={nombreDeCategoria}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <MasterDetail
      lista={lista}
      vacio={{
        titulo: "Ningún presupuesto seleccionado",
        descripcion: "Elige uno de la lista para editarlo aquí, o crea uno nuevo.",
      }}
    />
  );
}

/**
 * De dónde sale el número: qué categorías alimentan el presupuesto y cuánto
 * entró por cada vía.
 *
 * Sin esto, un presupuesto que se mueve solo es magia — y la magia en una app
 * de dinero se traduce en desconfiar de la cifra.
 */
function OrigenDelGasto({
  budget,
  currency,
  nombreDeCategoria,
}: {
  budget: Budget;
  currency: string;
  nombreDeCategoria: (id: string) => string | undefined;
}) {
  const vivas = budget.categoryIds.filter((id) => !budget.staleCategoryIds.includes(id));
  const huerfanas = budget.staleCategoryIds.length;
  if (vivas.length === 0 && huerfanas === 0) return null;

  return (
    <div className="space-y-1" data-origen-gasto>
      {vivas.length > 0 && (
        <p className="text-xs opacity-60">
          Cuenta solo:{" "}
          <span className="opacity-100">
            {vivas.map((id) => nombreDeCategoria(id) ?? "—").join(", ")}
          </span>
        </p>
      )}

      {/* Los dos números solo si hay algo por las dos vías: con una sola, el
          desglose no añade nada y estorba. */}
      {budget.spentFromManual !== 0 && budget.spentFromCategories !== 0 && (
        <p className="text-xs opacity-50">
          {formatMoney(budget.spentFromCategories, currency)} por categoría ·{" "}
          {formatMoney(budget.spentFromManual, currency)} enlazado a mano
        </p>
      )}

      {huerfanas > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {huerfanas === 1
            ? "Una categoría de este presupuesto ya no existe; lo que gastabas en ella ha dejado de contar."
            : `${huerfanas} categorías de este presupuesto ya no existen; lo que gastabas en ellas ha dejado de contar.`}
        </p>
      )}
    </div>
  );
}

function BudgetCard({
  budget,
  currency,
  nombreDeCategoria,
}: {
  budget: Budget;
  currency: string;
  nombreDeCategoria: (id: string) => string | undefined;
}) {
  return (
    <Link to={`/presupuestos/${budget.id}`} className="block">
      <Card className="space-y-3 transition-colors hover:bg-black/2 dark:hover:bg-white/8">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{budget.name}</p>
            <p className="text-xs opacity-60">
              {BUDGET_RECURRENCE_LABELS[budget.recurrence]}
              {budget.daysRemaining > 0 &&
                ` · quedan ${budget.daysRemaining} día${budget.daysRemaining === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {/* Lo primero es lo que queda, no lo gastado. */}
            {budget.isOverBudget ? (
              <p className="text-lg font-bold tabular-nums text-expense">
                −{formatMoney(budget.overspent, currency)}
              </p>
            ) : (
              <p className="text-lg font-bold tabular-nums">
                {formatMoney(budget.remaining, currency)}
              </p>
            )}
            <p className="text-xs opacity-60">
              {budget.isOverBudget ? "excedido" : "disponible"}
            </p>
          </div>
        </div>

        <ProgressBar
          progress={budget.progress}
          isOverBudget={budget.isOverBudget}
          isNearLimit={budget.isNearLimit}
        />

        <div className="flex justify-between text-xs opacity-60">
          <span>
            {formatMoney(budget.spent, currency)} de{" "}
            {formatMoney(budget.amount, currency)}
          </span>
          {budget.daysRemaining > 0 && !budget.isOverBudget && (
            <span>{formatMoney(budget.suggestedDailySpend, currency)}/día</span>
          )}
        </div>

        <OrigenDelGasto
          budget={budget}
          currency={currency}
          nombreDeCategoria={nombreDeCategoria}
        />
      </Card>
    </Link>
  );
}

/**
 * Selector de las categorías que alimentan el presupuesto.
 *
 * Fichas conmutables en vez de un `<select multiple>`: en el móvil un
 * desplegable múltiple es incómodo y no deja ver de un vistazo qué hay
 * marcado, que es justo lo que importa aquí.
 */
function SelectorCategorias({
  categorias,
  seleccionadas,
  onToggle,
}: {
  categorias: Category[];
  seleccionadas: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Categorías que cuentan solas</legend>
      <p className="text-xs opacity-60">
        Todo lo que gastes en las categorías que marques contará en este presupuesto sin
        que tengas que enlazarlo. Si no marcas ninguna, solo cuenta lo que enlaces a mano.
      </p>

      {categorias.length === 0 ? (
        <p className="text-xs opacity-60">No tienes categorías de gasto todavía.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {categorias.map((categoria) => {
            const marcada = seleccionadas.includes(categoria.id);
            return (
              <button
                key={categoria.id}
                type="button"
                onClick={() => onToggle(categoria.id)}
                aria-pressed={marcada}
                data-categoria={categoria.name}
                className={cn(
                  // 44 px de alto: objetivo táctil de §10.
                  "min-h-11 rounded-full border px-3 text-xs font-medium",
                  marcada
                    ? "border-primary bg-primary-light text-primary-dark dark:bg-primary/20 dark:text-primary-light"
                    : "border-black/15 dark:border-white/20",
                )}
              >
                {categoria.name}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------------------

interface ValoresPresupuesto {
  name: string;
  amount: string;
  recurrence: Budget["recurrence"];
  startDate: string;
  endDate: string;
  /** Categorías cuyo gasto cuenta solo (§20). */
  categoryIds: string[];
}

/** Período vigente, solo para mostrarlo al editar. */
interface PeriodoVigente {
  start: number;
  end: number;
  dias: number;
}

/** Carga los datos y monta el formulario con `key`. */
export function BudgetFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { timeZone } = useDisplaySettings();
  const ahora = useNow();
  const presupuestos = useBudgets();
  const editando = id !== undefined;

  if (presupuestos.isPending) {
    return (
      <div>
        <ScreenHeader
          title={editando ? "Editar presupuesto" : "Nuevo presupuesto"}
          onBack={() => void navigate("/presupuestos")}
        />
        <div className="space-y-4 p-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </div>
    );
  }

  const existente = presupuestos.data?.find((b) => b.id === id);
  const hoy = millisToDateInput(ahora, timeZone);
  const inicial: ValoresPresupuesto = existente
    ? {
        name: existente.name,
        amount: String(existente.amount),
        recurrence: existente.recurrence,
        startDate: millisToDateInput(existente.startDate, timeZone),
        endDate: millisToDateInput(existente.endDate, timeZone),
        // Las huérfanas se dejan fuera: no se pueden volver a marcar y
        // mantenerlas solo serviría para reenviar al servidor un id muerto.
        categoryIds: existente.categoryIds.filter(
          (c) => !existente.staleCategoryIds.includes(c),
        ),
      }
    : {
        name: "",
        amount: "",
        recurrence: "MONTHLY",
        startDate: hoy,
        endDate: hoy,
        categoryIds: [],
      };

  const periodo: PeriodoVigente | null = existente
    ? {
        start: existente.periodStart,
        end: existente.periodEnd,
        dias: existente.periodDurationDays,
      }
    : null;

  return (
    <BudgetForm
      key={id ?? "nuevo"}
      id={id}
      inicial={inicial}
      timeZone={timeZone}
      periodo={periodo}
      existente={existente}
    />
  );
}

function BudgetForm({
  id,
  inicial,
  timeZone,
  periodo,
  existente,
}: {
  id: string | undefined;
  inicial: ValoresPresupuesto;
  timeZone: string;
  periodo: PeriodoVigente | null;
  /** El presupuesto ya guardado, para enseñar de dónde sale su gasto. */
  existente: Budget | undefined;
}) {
  const navigate = useNavigate();
  const editando = id !== undefined;

  const guardar = useSaveBudget();
  const borrar = useDeleteBudget();
  const categorias = useCategories();
  const { currency } = useDisplaySettings();

  const [name, setName] = useState(inicial.name);
  const [amount, setAmount] = useState(inicial.amount);
  const [recurrence, setRecurrence] = useState<Budget["recurrence"]>(inicial.recurrence);
  const [startDate, setStartDate] = useState(inicial.startDate);
  const [endDate, setEndDate] = useState(inicial.endDate);
  const [categoryIds, setCategoryIds] = useState(inicial.categoryIds);
  // Id generado en cliente: hace idempotente la creación (§9).
  const idNuevo = useIdNuevo();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  async function alEnviar(event: FormEvent) {
    event.preventDefault();
    setErrores({});

    const importe = parseAmountInput(amount);
    if (importe === null || importe <= 0) {
      setErrores({ amount: "El monto debe ser mayor que cero" });
      return;
    }

    try {
      await guardar.mutateAsync({
        id,
        nuevoId: idNuevo,
        name,
        amount: importe,
        recurrence,
        startDate: dateInputToMillis(startDate, timeZone),
        // Fin del día, para que el último día entre entero en el período.
        endDate: dateInputToMillis(endDate, timeZone) + 86_399_999,
        categoryIds,
      });
      void navigate("/presupuestos");
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrores(
          Object.keys(error.fields).length > 0
            ? error.fields
            : { general: error.message },
        );
      } else {
        setErrores({ general: "No se pudo guardar" });
      }
    }
  }

  return (
    <div>
      <ScreenHeader
        title={editando ? "Editar presupuesto" : "Nuevo presupuesto"}
        onBack={() => void navigate("/presupuestos")}
        action={
          editando ? (
            <button
              type="button"
              onClick={() => setConfirmarBorrado(true)}
              aria-label="Eliminar"
              className="grid size-11 place-items-center rounded-xl text-expense hover:bg-expense/10"
            >
              <Trash2 className="size-5" />
            </button>
          ) : null
        }
      />

      <form onSubmit={(e) => void alEnviar(e)} className="space-y-5 p-4">
        {errores.general && (
          <p
            role="alert"
            className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense"
          >
            {errores.general}
          </p>
        )}

        <TextField
          label="Nombre"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errores.name}
          placeholder="Comida del mes"
        />

        <TextField
          label="Monto"
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errores.amount}
          placeholder="0.00"
        />

        <SelectorCategorias
          categorias={(categorias.data ?? []).filter((c) => c.type === "EXPENSE")}
          seleccionadas={categoryIds}
          onToggle={(idCategoria) =>
            setCategoryIds((previas) =>
              previas.includes(idCategoria)
                ? previas.filter((c) => c !== idCategoria)
                : [...previas, idCategoria],
            )
          }
        />
        {errores.categoryIds && (
          <p role="alert" className="text-xs text-expense">
            {errores.categoryIds}
          </p>
        )}

        <SelectField
          label="Recurrencia"
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as Budget["recurrence"])}
          hint={
            recurrence === "NONE"
              ? "Un solo período, entre las dos fechas."
              : "La fecha de inicio marca el día de corte de cada período."
          }
        >
          {BUDGET_RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {BUDGET_RECURRENCE_LABELS[r]}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Fecha de inicio"
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          error={errores.startDate}
        />

        <TextField
          label={recurrence === "NONE" ? "Fecha de fin" : "Fin del primer período"}
          type="date"
          required
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          error={errores.endDate}
        />

        {periodo && (
          <Card className="space-y-1 text-xs opacity-70">
            <p className="font-medium opacity-100">Período actual</p>
            <p>
              {millisToDateInput(periodo.start, timeZone)} —{" "}
              {millisToDateInput(periodo.end, timeZone)}
            </p>
            <p>{periodo.dias} días</p>
          </Card>
        )}

        {existente && (
          <Card className="space-y-2" data-desglose-presupuesto>
            <p className="text-sm font-medium">De dónde sale el gasto</p>
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="opacity-60">Por categoría</dt>
                <dd className="tabular-nums">
                  {formatMoney(existente.spentFromCategories, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="opacity-60">Enlazado a mano</dt>
                <dd className="tabular-nums">
                  {formatMoney(existente.spentFromManual, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-black/8 pt-1 font-semibold dark:border-white/10">
                <dt>Total del período</dt>
                <dd className="tabular-nums">{formatMoney(existente.spent, currency)}</dd>
              </div>
            </dl>

            {/*
              Decisión del punto 9, dicha en la UI en vez de dejar un botón que
              no hace nada: no se puede excluir a mano un movimiento concreto
              que entró por categoría. Habría que guardar una tercera lista de
              excepciones, y las dos salidas que ya existen cubren el caso.
            */}
            <p className="text-xs opacity-60">
              No se puede sacar un gasto suelto que entró por categoría. Si alguno no
              debería contar, cámbiale la categoría o quita esa categoría de aquí.
            </p>
          </Card>
        )}

        <Button type="submit" full size="lg" disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </form>

      <ConfirmDialog
        open={confirmarBorrado}
        onOpenChange={setConfirmarBorrado}
        title="¿Eliminar el presupuesto?"
        description="Las transacciones enlazadas no se borran; solo dejan de contar aquí."
        onConfirm={() => {
          if (!id) return;
          borrar.mutate(id, { onSuccess: () => void navigate("/presupuestos") });
        }}
      />
    </div>
  );
}
