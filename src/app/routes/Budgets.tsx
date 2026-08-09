import { PieChart, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { dateInputToMillis, millisToDateInput } from "@/lib/dates.ts";
import { formatMoney, parseAmountInput } from "@/lib/money.ts";
import { BUDGET_RECURRENCES, BUDGET_RECURRENCE_LABELS } from "@/shared/constants.ts";
import type { Budget } from "@/shared/types.ts";

import { ProgressBar } from "../components/domain.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, EmptyState, Skeleton } from "../components/ui/card.tsx";
import { SelectField, TextField } from "../components/ui/field.tsx";
import { ConfirmDialog } from "../components/ui/responsive-dialog.tsx";
import { useBudgets, useDeleteBudget, useSaveBudget } from "../hooks/api.ts";
import { useDisplaySettings, useNow } from "../hooks/use-month.ts";
import { ScreenHeader } from "../layouts/MobileLayout.tsx";
import { ApiRequestError } from "../lib/api.ts";

/**
 * Presupuestos. Réplica de `BudgetsScreen.kt`.
 *
 * La tarjeta destaca el **dinero restante**, no el gastado: así quedó la app
 * tras el commit a5f68ad y §8.4 pide respetarlo.
 */
export function BudgetsScreen() {
  const presupuestos = useBudgets();
  const { currency } = useDisplaySettings();

  return (
    <div>
      <ScreenHeader
        title="Presupuestos"
        action={
          <Button asChild size="icon" variant="ghost" aria-label="Nuevo presupuesto">
            <Link to="/presupuesto/nuevo">
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
              description="Crea uno y enlaza tus gastos para seguirlo."
              action={
                <Button asChild size="sm">
                  <Link to="/presupuesto/nuevo">Crear presupuesto</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          presupuestos.data?.map((b) => (
            <BudgetCard key={b.id} budget={b} currency={currency} />
          ))
        )}
      </div>
    </div>
  );
}

function BudgetCard({ budget, currency }: { budget: Budget; currency: string }) {
  return (
    <Link to={`/presupuesto/${budget.id}`} className="block">
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
      </Card>
    </Link>
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
          onBack={() => void navigate(-1)}
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
      }
    : { name: "", amount: "", recurrence: "MONTHLY", startDate: hoy, endDate: hoy };

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
    />
  );
}

function BudgetForm({
  id,
  inicial,
  timeZone,
  periodo,
}: {
  id: string | undefined;
  inicial: ValoresPresupuesto;
  timeZone: string;
  periodo: PeriodoVigente | null;
}) {
  const navigate = useNavigate();
  const editando = id !== undefined;

  const guardar = useSaveBudget();
  const borrar = useDeleteBudget();

  const [name, setName] = useState(inicial.name);
  const [amount, setAmount] = useState(inicial.amount);
  const [recurrence, setRecurrence] = useState<Budget["recurrence"]>(inicial.recurrence);
  const [startDate, setStartDate] = useState(inicial.startDate);
  const [endDate, setEndDate] = useState(inicial.endDate);
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
        name,
        amount: importe,
        recurrence,
        startDate: dateInputToMillis(startDate, timeZone),
        // Fin del día, para que el último día entre entero en el período.
        endDate: dateInputToMillis(endDate, timeZone) + 86_399_999,
      });
      void navigate(-1);
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
        onBack={() => void navigate(-1)}
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
          borrar.mutate(id, { onSuccess: () => void navigate(-1) });
        }}
      />
    </div>
  );
}
