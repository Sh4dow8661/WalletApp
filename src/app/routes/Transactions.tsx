import { Receipt, Search, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { dateInputToMillis, millisToDateInput } from "@/lib/dates.ts";
import { parseAmountInput } from "@/lib/money.ts";
import type { TransactionType } from "@/shared/constants.ts";

import { MonthSelector } from "../components/domain.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, EmptyState, Skeleton } from "../components/ui/card.tsx";
import { SelectField, TextAreaField, TextField } from "../components/ui/field.tsx";
import { ConfirmDialog } from "../components/ui/responsive-dialog.tsx";
import {
  useAccounts,
  useBudgets,
  useCategories,
  useDeleteTransaction,
  useSaveTransaction,
  useTransaction,
  useTransactions,
} from "../hooks/api.ts";
import { useMonth, useNow } from "../hooks/use-month.tsx";
import { ScreenHeader } from "../layouts/MobileLayout.tsx";
import { MasterDetail } from "../layouts/MasterDetail.tsx";
import { ApiRequestError } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";
import { TransactionRow } from "./Dashboard.tsx";

/** Lista de transacciones, filtrable por mes, categoría y cuenta. */
export function TransactionsScreen() {
  const { year, month, label, from, to, currency, previous, next } = useMonth();
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const categorias = useCategories();
  const cuentas = useAccounts();
  const transacciones = useTransactions({
    from,
    to,
    categoryId: categoryId || undefined,
    accountId: accountId || undefined,
  });

  // La búsqueda se aplica en el cliente: son las transacciones de un mes, ya
  // descargadas, así que filtrar aquí es instantáneo y no gasta una consulta.
  const termino = normalizar(busqueda);
  const visibles = (transacciones.data ?? []).filter((tx) => {
    if (termino === "") return true;
    const categoria = categorias.data?.find((c) => c.id === tx.categoryId);
    return (
      normalizar(tx.note).includes(termino) ||
      normalizar(categoria?.name ?? "").includes(termino) ||
      String(tx.amount).includes(termino)
    );
  });

  const lista = (
    <div>
      <ScreenHeader title="Transacciones" />

      <div className="space-y-3 p-4">
        <MonthSelector
          label={label}
          onPrevious={previous}
          onNext={next}
          // En escritorio el selector de mes está en la cabecera fija.
          className="xl:hidden"
        />

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-40" />
          {/* `data-buscar` es lo que enfoca el atajo `/` del escritorio. */}
          <input
            data-buscar
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nota, categoría o importe"
            aria-label="Buscar transacciones"
            className={cn(
              "min-h-11 w-full rounded-xl border border-black/15 bg-white pl-9 pr-3 text-sm",
              "dark:border-white/20 dark:bg-white/5",
              "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30",
            )}
          />
        </div>

        {/* Filtros como chips scrollables, según §10. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <FiltroChip
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Toda categoría"
            options={(categorias.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <FiltroChip
            value={accountId}
            onChange={setAccountId}
            placeholder="Toda cuenta"
            options={(cuentas.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
          />
        </div>

        {transacciones.isPending ? (
          <Skeleton className="h-64" />
        ) : visibles.length === 0 ? (
          <Card>
            <EmptyState
              icon={Receipt}
              title="Sin movimientos"
              description={
                termino === ""
                  ? `No hay transacciones en ${label.toLowerCase()} con estos filtros.`
                  : `Nada coincide con "${busqueda}".`
              }
            />
          </Card>
        ) : (
          <Card className="divide-y divide-black/5 p-0 dark:divide-white/10">
            {visibles.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                categories={categorias.data ?? []}
                currency={currency}
              />
            ))}
          </Card>
        )}

        <p className="px-1 text-center text-xs opacity-50">
          {visibles.length} movimiento
          {visibles.length === 1 ? "" : "s"} · {year}-{String(month).padStart(2, "0")}
        </p>
      </div>
    </div>
  );

  return (
    <MasterDetail
      lista={lista}
      vacio={{
        titulo: "Ninguna transacción seleccionada",
        descripcion: "Elige una de la lista para editarla aquí, o crea una nueva.",
      }}
    />
  );
}

/** Minúsculas y sin acentos, para que "educacion" encuentre "Educación". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .toLowerCase()
    .trim();
}

function FiltroChip({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        // 44 px de alto: objetivo táctil de §10.
        "min-h-11 shrink-0 rounded-full border px-3 text-xs font-medium",
        value
          ? "border-primary bg-primary-light text-primary-dark dark:bg-primary/20 dark:text-primary-light"
          : "border-black/15 dark:border-white/20",
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------------------

/** Valores con los que arranca el formulario. */
interface ValoresIniciales {
  type: TransactionType;
  amount: string;
  accountId: string;
  transferAccountId: string;
  categoryId: string;
  note: string;
  date: string;
  budgetIds: string[];
  transferGroupId: string | null;
}

/**
 * Carga los datos y monta el formulario.
 *
 * El formulario va aparte y con `key`, para poder inicializar su estado con
 * `useState` en vez de volcarlo desde un `useEffect`. Cargar primero y montar
 * después evita los renders en cascada de sincronizar estado dentro de un
 * efecto, y hace que cambiar de transacción reinicie el formulario limpio.
 */
export function TransactionFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editando = id !== undefined;

  const { timeZone } = useMonth();
  const ahora = useNow();
  const existente = useTransaction(editando ? id : null);
  const cuentas = useAccounts();

  if (cuentas.isPending || (editando && existente.isPending)) {
    return (
      <div>
        <ScreenHeader
          title={editando ? "Editar transacción" : "Nueva transacción"}
          onBack={() => void navigate("/transacciones")}
        />
        <div className="space-y-4 p-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </div>
    );
  }

  const tx = existente.data;
  const inicial: ValoresIniciales = tx
    ? {
        type: tx.type,
        amount: String(tx.amount),
        accountId: tx.accountId,
        transferAccountId: tx.transferAccountId ?? "",
        categoryId: tx.categoryId ?? "",
        note: tx.note,
        date: millisToDateInput(tx.date, timeZone),
        budgetIds: tx.budgetIds,
        transferGroupId: tx.transferGroupId,
      }
    : {
        type: "EXPENSE",
        amount: "",
        // Primera cuenta por defecto, como hace el ViewModel al abrir el alta.
        accountId: cuentas.data?.[0]?.id ?? "",
        transferAccountId: "",
        categoryId: "",
        note: "",
        date: millisToDateInput(ahora, timeZone),
        budgetIds: [],
        transferGroupId: null,
      };

  return (
    <TransactionForm key={id ?? "nueva"} id={id} inicial={inicial} timeZone={timeZone} />
  );
}

/**
 * Formulario de transacción. Réplica de `AddEditTransactionScreen.kt`, con las
 * reglas de §8.2: una transferencia no lleva categoría, exige cuenta destino
 * distinta del origen y nunca se enlaza a presupuestos.
 */
function TransactionForm({
  id,
  inicial,
  timeZone,
}: {
  id: string | undefined;
  inicial: ValoresIniciales;
  timeZone: string;
}) {
  const navigate = useNavigate();
  const editando = id !== undefined;

  const cuentas = useAccounts();
  const categorias = useCategories();
  const presupuestos = useBudgets();
  const guardar = useSaveTransaction();
  const borrar = useDeleteTransaction();

  const [type, setType] = useState<TransactionType>(inicial.type);
  const [amount, setAmount] = useState(inicial.amount);
  const [accountId, setAccountId] = useState(inicial.accountId);
  const [transferAccountId, setTransferAccountId] = useState(inicial.transferAccountId);
  const [categoryId, setCategoryId] = useState(inicial.categoryId);
  const [note, setNote] = useState(inicial.note);
  const [date, setDate] = useState(inicial.date);
  const [budgetIds, setBudgetIds] = useState<string[]>(inicial.budgetIds);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const categoriasDelTipo = (categorias.data ?? []).filter((c) =>
    type === "INCOME" ? c.type === "INCOME" : c.type === "EXPENSE",
  );

  function cambiarTipo(nuevo: TransactionType) {
    setType(nuevo);
    // Igual que `setType` en el ViewModel: la categoría deja de ser válida y las
    // transferencias pierden sus presupuestos.
    setCategoryId("");
    if (nuevo === "TRANSFER") setBudgetIds([]);
  }

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
        amount: importe,
        type,
        accountId,
        transferAccountId: type === "TRANSFER" ? transferAccountId : null,
        categoryId: type === "TRANSFER" ? null : categoryId || null,
        note,
        date: dateInputToMillis(date, timeZone),
        budgetIds: type === "TRANSFER" ? [] : budgetIds,
      });
      void navigate("/transacciones");
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
        title={editando ? "Editar transacción" : "Nueva transacción"}
        onBack={() => void navigate("/transacciones")}
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

        {/* Selector de tipo. */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
          {(
            [
              ["EXPENSE", "Gasto"],
              ["INCOME", "Ingreso"],
              ["TRANSFER", "Transferencia"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              onClick={() => cambiarTipo(valor)}
              className={cn(
                "min-h-11 rounded-lg px-2 text-sm font-medium transition-colors",
                type === valor
                  ? "bg-white shadow-sm dark:bg-neutral-700"
                  : "opacity-60 hover:opacity-100",
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <TextField
          label="Monto"
          inputMode="decimal"
          required
          autoFocus={!editando}
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errores.amount}
          className="text-2xl font-semibold tabular-nums"
        />

        <SelectField
          label={type === "TRANSFER" ? "Cuenta origen" : "Cuenta"}
          required
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          error={errores.accountId}
        >
          <option value="">Selecciona…</option>
          {cuentas.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>

        {type === "TRANSFER" ? (
          <SelectField
            label="Cuenta destino"
            required
            value={transferAccountId}
            onChange={(e) => setTransferAccountId(e.target.value)}
            error={errores.transferAccountId}
            hint="El dinero sale de la cuenta origen y entra en esta."
          >
            <option value="">Selecciona…</option>
            {cuentas.data
              ?.filter((c) => c.id !== accountId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </SelectField>
        ) : (
          <SelectField
            label="Categoría"
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            error={errores.categoryId}
          >
            <option value="">Selecciona…</option>
            {categoriasDelTipo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        )}

        <TextField
          label="Fecha"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errores.date}
        />

        <TextAreaField
          label="Nota"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Opcional"
        />

        {/* Enlace manual a presupuestos (§8.4). Nunca en transferencias. */}
        {type !== "TRANSFER" && (presupuestos.data?.length ?? 0) > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Presupuestos</legend>
            <p className="text-xs opacity-60">
              {type === "INCOME"
                ? "Un ingreso enlazado devuelve saldo al presupuesto."
                : "Marca a qué presupuestos se aplica este gasto."}
            </p>
            <div className="flex flex-wrap gap-2">
              {presupuestos.data?.map((b) => {
                const marcado = budgetIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={marcado}
                    onClick={() =>
                      setBudgetIds((prev) =>
                        marcado ? prev.filter((x) => x !== b.id) : [...prev, b.id],
                      )
                    }
                    className={cn(
                      "min-h-11 rounded-full border px-3 text-xs font-medium",
                      marcado
                        ? "border-primary bg-primary-light text-primary-dark dark:bg-primary/20 dark:text-primary-light"
                        : "border-black/15 dark:border-white/20",
                    )}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <Button type="submit" full size="lg" disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </form>

      <ConfirmDialog
        open={confirmarBorrado}
        onOpenChange={setConfirmarBorrado}
        title="¿Eliminar la transacción?"
        description={
          inicial.transferGroupId
            ? "Es una transferencia: se eliminarán las dos partes y los balances de ambas cuentas volverán atrás."
            : "Esta acción no se puede deshacer."
        }
        onConfirm={() => {
          if (!id) return;
          borrar.mutate(id, { onSuccess: () => void navigate("/transacciones") });
        }}
      />
    </div>
  );
}
