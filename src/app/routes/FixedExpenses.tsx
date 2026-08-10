import {
  AlertTriangle,
  CalendarClock,
  Check,
  ClipboardPaste,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { dateInputToMillis, millisToDateInput } from "@/lib/dates.ts";
import {
  type FixedExpenseSort,
  DIAS_AVISO,
  daysUntilDue,
  dueStatus,
  groupFixedExpensesByCategory,
  monthlyEquivalent,
  sortFixedExpenses,
  summarizeFixedExpenses,
  weeklyEquivalent,
} from "@/lib/gastos-fijos.ts";
import { formatMoney, parseAmountInput } from "@/lib/money.ts";
import type { Account, Category, FixedExpense } from "@/shared/types.ts";

import { CategoryIcon } from "../components/domain.tsx";
import { ImportarGastosFijosDialog } from "../components/importar-gastos-fijos.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, EmptyState, Skeleton } from "../components/ui/card.tsx";
import { SelectField, SwitchField, TextField } from "../components/ui/field.tsx";
import { ConfirmDialog } from "../components/ui/responsive-dialog.tsx";
import {
  useAccounts,
  useCategories,
  useDeleteFixedExpense,
  useFixedExpenses,
  useMarkFixedExpensePaid,
  useSaveFixedExpense,
} from "../hooks/api.ts";
import { useIdNuevo } from "../hooks/use-id-nuevo.ts";
import { useMonth } from "../hooks/use-month.tsx";
import { MasterDetail } from "../layouts/MasterDetail.tsx";
import { ScreenHeader } from "../layouts/MobileLayout.tsx";
import { ApiRequestError } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";

/**
 * Gastos fijos.
 *
 * La cifra que manda no es el importe del recibo sino el **costo mensual
 * equivalente**: lo que habría que apartar cada mes. Un seguro de 600 al año no
 * cuesta 600 un mes y 0 los demás, cuesta 50 al mes. Ver `lib/gastos-fijos.ts`.
 */

/** Periodicidades habituales. El backend admite cualquier entero de 1 a 120. */
const PERIODOS = [
  { meses: 1, etiqueta: "Cada mes" },
  { meses: 2, etiqueta: "Cada 2 meses" },
  { meses: 3, etiqueta: "Cada 3 meses" },
  { meses: 6, etiqueta: "Cada 6 meses" },
  { meses: 12, etiqueta: "Cada año" },
] as const;

function etiquetaPeriodo(meses: number): string {
  return PERIODOS.find((p) => p.meses === meses)?.etiqueta ?? `Cada ${meses} meses`;
}

/**
 * Cómo se ordena o se agrupa la lista.
 *
 * «categoria» no es un orden más sino una agrupación con subtotales: es como
 * está montada la hoja de cálculo de la que salen estos gastos, y es donde el
 * usuario los lee.
 */
type VistaGastos = FixedExpenseSort | "categoria";

export function FixedExpensesScreen() {
  const gastos = useFixedExpenses();
  const cuentas = useAccounts();
  const categorias = useCategories();
  const { year, month, label, currency, timeZone } = useMonth();
  const [vista, setVista] = useState<VistaGastos>("vencimiento");
  const [importando, setImportando] = useState(false);

  // Se fija al montar: llamar a Date.now() en cada render es impuro, y los días
  // que faltan para un vencimiento no necesitan refrescarse al segundo.
  const [ahora] = useState(() => Date.now());

  const lista = gastos.data ?? [];
  const resumen = summarizeFixedExpenses(lista, year, month, ahora, timeZone);
  const listaCategorias = categorias.data ?? [];
  const nombreDeCategoria = (id: string) =>
    listaCategorias.find((cat) => cat.id === id)?.name;

  const agrupado = vista === "categoria";
  // Dentro de cada categoría manda el costo: en una lectura por grupos lo que
  // se busca es qué pesa más, no qué vence antes.
  const ordenados = sortFixedExpenses(lista, agrupado ? "costo" : vista);
  const grupos = agrupado
    ? groupFixedExpensesByCategory(lista, nombreDeCategoria, "costo")
    : [];

  const contenido = (
    <div>
      <ScreenHeader
        title="Gastos fijos"
        action={
          <div className="flex items-center">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Importar desde el Excel"
              onClick={() => setImportando(true)}
            >
              <ClipboardPaste />
            </Button>
            <Button asChild size="icon" variant="ghost" aria-label="Nuevo gasto fijo">
              <Link to="/gastos-fijos/nuevo">
                <Plus />
              </Link>
            </Button>
          </div>
        }
      />

      <ImportarGastosFijosDialog
        open={importando}
        onOpenChange={setImportando}
        gastos={lista}
        cuentas={cuentas.data ?? []}
        currency={currency}
        timeZone={timeZone}
      />

      <div className="space-y-4 p-4">
        {gastos.isPending ? (
          <Skeleton className="h-32" />
        ) : lista.length === 0 ? (
          <Card className="space-y-4">
            <EmptyState
              icon={Repeat}
              title="Sin gastos fijos"
              description="Añade los recibos que se repiten para saber cuánto te cuestan al mes, o pega de golpe la tabla de tu Excel."
            />
            {/* Con la lista vacía, importar es lo primero que se quiere hacer:
                el botón de la cabecera existe, pero aquí es donde se mira. */}
            <Button variant="outline" full onClick={() => setImportando(true)}>
              <ClipboardPaste />
              Importar desde el Excel
            </Button>
          </Card>
        ) : (
          <>
            {/* Dos números distintos, y los dos hacen falta. */}
            <Card className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs opacity-60">Equivalente al mes</p>
                  <p
                    className="text-xl font-bold tabular-nums"
                    data-testid="total-mensual-equivalente"
                  >
                    {formatMoney(resumen.monthlyEquivalent, currency)}
                  </p>
                  <p className="text-xs opacity-50">
                    Lo que deberías apartar ·{" "}
                    {/* Semanal = mensual / 4, la convención de la hoja de
                        cálculo del usuario, NO 4,33. Ver `SEMANAS_POR_MES`. */}
                    <span data-testid="total-semanal-equivalente">
                      {formatMoney(weeklyEquivalent(resumen.monthlyEquivalent), currency)}
                    </span>{" "}
                    a la semana
                  </p>
                </div>
                <div>
                  <p className="text-xs opacity-60">A pagar en {label.toLowerCase()}</p>
                  <p className="text-xl font-bold tabular-nums">
                    {formatMoney(resumen.dueThisMonth, currency)}
                  </p>
                  <p className="text-xs opacity-50">
                    {resumen.countDueThisMonth === 1
                      ? "1 recibo"
                      : `${resumen.countDueThisMonth} recibos`}
                  </p>
                </div>
              </div>

              {(resumen.overdue > 0 || resumen.dueSoon > 0) && (
                <div className="space-y-1 border-t border-black/8 pt-3 dark:border-white/10">
                  {resumen.overdue > 0 && (
                    <p className="flex items-center gap-1.5 text-xs text-expense">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                      {resumen.overdue === 1
                        ? "1 recibo vencido."
                        : `${resumen.overdue} recibos vencidos.`}
                    </p>
                  )}
                  {resumen.dueSoon > 0 && (
                    <p className="flex items-center gap-1.5 text-xs text-warning">
                      <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                      {resumen.dueSoon === 1
                        ? `1 recibo vence en los próximos ${DIAS_AVISO} días.`
                        : `${resumen.dueSoon} recibos vencen en los próximos ${DIAS_AVISO} días.`}
                    </p>
                  )}
                </div>
              )}
            </Card>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs opacity-60">Ver por</span>
              {(
                [
                  ["vencimiento", "Vencimiento"],
                  ["costo", "Costo mensual"],
                  ["categoria", "Categoría"],
                ] as const
              ).map(([valor, texto]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setVista(valor)}
                  aria-pressed={vista === valor}
                  className={cn(
                    "min-h-11 rounded-full border px-3 text-xs font-medium",
                    vista === valor
                      ? "border-primary bg-primary-light text-primary-dark dark:bg-primary/20 dark:text-primary-light"
                      : "border-black/15 dark:border-white/20",
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>

            {agrupado ? (
              <div className="space-y-5">
                {grupos.map((grupo) => (
                  <section
                    key={grupo.categoryId ?? "sin-categoria"}
                    data-grupo={grupo.categoryName}
                    className="space-y-2"
                  >
                    <div className="flex items-baseline justify-between gap-2 border-b border-black/8 pb-1 dark:border-white/10">
                      <h3 className="text-sm font-semibold">{grupo.categoryName}</h3>
                      <p className="text-sm font-semibold tabular-nums" data-subtotal>
                        {formatMoney(grupo.monthlyEquivalent, currency)}
                        <span className="ml-1 text-xs font-normal opacity-50">
                          al mes
                        </span>
                      </p>
                    </div>
                    <div className="space-y-2">
                      {grupo.expenses.map((gasto) => (
                        <FilaGastoFijo
                          key={gasto.id}
                          gasto={gasto}
                          cuentas={cuentas.data ?? []}
                          categorias={listaCategorias}
                          currency={currency}
                          timeZone={timeZone}
                          ahora={ahora}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {ordenados.map((gasto) => (
                  <FilaGastoFijo
                    key={gasto.id}
                    gasto={gasto}
                    cuentas={cuentas.data ?? []}
                    categorias={listaCategorias}
                    currency={currency}
                    timeZone={timeZone}
                    ahora={ahora}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <MasterDetail
      lista={contenido}
      vacio={{
        titulo: "Ningún gasto fijo seleccionado",
        descripcion: "Elige uno de la lista para editarlo aquí, o crea uno nuevo.",
      }}
    />
  );
}

function FilaGastoFijo({
  gasto,
  cuentas,
  categorias,
  currency,
  timeZone,
  ahora,
}: {
  gasto: FixedExpense;
  cuentas: Account[];
  categorias: Category[];
  currency: string;
  timeZone: string;
  ahora: number;
}) {
  const pagar = useMarkFixedExpensePaid();
  const [confirmarPago, setConfirmarPago] = useState(false);
  const idTransaccion = useIdNuevo();

  const estado = dueStatus(gasto.nextDueDate, ahora, timeZone);
  const dias = daysUntilDue(gasto.nextDueDate, ahora, timeZone);
  const cuenta = cuentas.find((c) => c.id === gasto.accountId);
  const categoria = categorias.find((c) => c.id === gasto.categoryId);

  const textoVencimiento =
    estado === "vencido"
      ? `Venció hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}`
      : estado === "hoy"
        ? "Vence hoy"
        : `Vence en ${dias} ${dias === 1 ? "día" : "días"}`;

  return (
    // `data-gasto` da a los e2e un ancla estable para la fila, igual que
    // `data-cuenta` en la lista de cuentas.
    <Card
      data-gasto={gasto.id}
      className={cn("space-y-2", !gasto.isActive && "opacity-60")}
    >
      <div className="flex items-center gap-3">
        <Link
          to={`/gastos-fijos/${gasto.id}`}
          // 44 px de alto mínimo: objetivo táctil de §10.
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
        >
          {categoria ? (
            <CategoryIcon iconName={categoria.iconName} colorHex={categoria.colorHex} />
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-black/5 dark:bg-white/10">
              <Repeat className="size-5 opacity-60" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {gasto.name}
              {!gasto.isActive && " · inactivo"}
            </p>
            <p className="truncate text-xs opacity-60">
              {formatMoney(gasto.amount, currency)} · {etiquetaPeriodo(gasto.everyMonths)}
              {cuenta && ` · ${cuenta.name}`}
            </p>
          </div>
        </Link>

        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums">
            {formatMoney(monthlyEquivalent(gasto), currency)}
          </p>
          <p className="text-xs opacity-50">al mes</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-black/8 pt-2 dark:border-white/10">
        <span
          className={cn(
            "text-xs",
            !gasto.isActive
              ? "opacity-50"
              : estado === "vencido"
                ? "text-expense"
                : estado === "hoy" || estado === "proximo"
                  ? "text-warning"
                  : "opacity-60",
          )}
        >
          {gasto.isActive
            ? `${textoVencimiento} · ${millisToDateInput(gasto.nextDueDate, timeZone)}`
            : "Inactivo"}
        </span>

        {gasto.isActive && (
          <Button
            size="sm"
            variant="ghost"
            // `sm` mide 36 px y §10 exige 44 en móvil.
            className="min-h-11"
            onClick={() => setConfirmarPago(true)}
            disabled={pagar.isPending || gasto.accountId === null}
            title={
              gasto.accountId === null
                ? "Elige primero de qué cuenta sale"
                : "Marcar como pagado"
            }
          >
            <Check />
            Pagado
          </Button>
        )}
      </div>

      {/* Nunca se genera la transacción sola: hace falta confirmar. */}
      <ConfirmDialog
        open={confirmarPago}
        onOpenChange={setConfirmarPago}
        title="¿Marcar como pagado?"
        description={`Se creará un gasto de ${formatMoney(gasto.amount, currency)} en ${cuenta?.name ?? "la cuenta"} y el próximo vencimiento pasará al siguiente ciclo.`}
        confirmLabel="Marcar pagado"
        // Registrar un pago no destruye nada: el botón no debe salir en rojo.
        destructivo={false}
        onConfirm={() => pagar.mutate({ id: gasto.id, transactionId: idTransaccion })}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------------------

export function FixedExpenseFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const gastos = useFixedExpenses();
  const { timeZone } = useMonth();
  // Igual que en la lista: fijo al montar, no en cada render.
  const [hoy] = useState(() => Date.now());
  const editando = id !== undefined;

  if (gastos.isPending) {
    return (
      <div>
        <ScreenHeader
          title={editando ? "Editar gasto fijo" : "Nuevo gasto fijo"}
          onBack={() => void navigate("/gastos-fijos")}
        />
        <div className="space-y-4 p-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </div>
    );
  }

  const existente = gastos.data?.find((g) => g.id === id);
  const inicial = existente
    ? {
        name: existente.name,
        amount: String(existente.amount),
        everyMonths: String(existente.everyMonths),
        nextDueDate: millisToDateInput(existente.nextDueDate, timeZone),
        accountId: existente.accountId ?? "",
        categoryId: existente.categoryId ?? "",
        isActive: existente.isActive,
        note: existente.note,
      }
    : {
        name: "",
        amount: "",
        everyMonths: "1",
        nextDueDate: millisToDateInput(hoy, timeZone),
        accountId: "",
        categoryId: "",
        isActive: true,
        note: "",
      };

  return <FixedExpenseForm key={id ?? "nuevo"} id={id} inicial={inicial} />;
}

interface ValoresGastoFijo {
  name: string;
  amount: string;
  everyMonths: string;
  nextDueDate: string;
  accountId: string;
  categoryId: string;
  isActive: boolean;
  note: string;
}

function FixedExpenseForm({
  id,
  inicial,
}: {
  id: string | undefined;
  inicial: ValoresGastoFijo;
}) {
  const navigate = useNavigate();
  const guardar = useSaveFixedExpense();
  const borrar = useDeleteFixedExpense();
  const cuentas = useAccounts();
  const categorias = useCategories();
  const { currency, timeZone } = useMonth();
  const idNuevo = useIdNuevo();

  const [valores, setValores] = useState(inicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const editando = id !== undefined;
  const importe = parseAmountInput(valores.amount);
  const meses = Number(valores.everyMonths);
  const equivalente =
    importe !== null && meses >= 1
      ? monthlyEquivalent({
          amount: importe,
          everyMonths: meses,
          nextDueDate: 0,
          isActive: true,
        })
      : null;

  const set = <K extends keyof ValoresGastoFijo>(clave: K, valor: ValoresGastoFijo[K]) =>
    setValores((v) => ({ ...v, [clave]: valor }));

  async function alEnviar(event: FormEvent) {
    event.preventDefault();
    setErrores({});

    if (importe === null || importe <= 0) {
      setErrores({ amount: "El importe debe ser mayor que cero" });
      return;
    }

    try {
      await guardar.mutateAsync({
        id,
        nuevoId: idNuevo,
        name: valores.name,
        amount: importe,
        everyMonths: meses,
        nextDueDate: dateInputToMillis(valores.nextDueDate, timeZone),
        accountId: valores.accountId || null,
        categoryId: valores.categoryId || null,
        isActive: valores.isActive,
        note: valores.note,
      });
      void navigate("/gastos-fijos");
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

  const categoriasGasto = (categorias.data ?? []).filter((c) => c.type === "EXPENSE");

  return (
    <div>
      <ScreenHeader
        title={editando ? "Editar gasto fijo" : "Nuevo gasto fijo"}
        onBack={() => void navigate("/gastos-fijos")}
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
          value={valores.name}
          onChange={(e) => set("name", e.target.value)}
          error={errores.name}
          placeholder="Seguro del coche"
        />

        <TextField
          label="Importe del recibo"
          inputMode="decimal"
          required
          value={valores.amount}
          onChange={(e) => set("amount", e.target.value)}
          error={errores.amount}
          hint="Lo que pagas cada vez, no lo que te cuesta al mes."
        />

        <SelectField
          label="Cada cuánto se paga"
          value={valores.everyMonths}
          onChange={(e) => set("everyMonths", e.target.value)}
          error={errores.everyMonths}
        >
          {PERIODOS.map((p) => (
            <option key={p.meses} value={p.meses}>
              {p.etiqueta}
            </option>
          ))}
        </SelectField>

        {/* La cifra que de verdad importa, calculada en vivo. */}
        {equivalente !== null && (
          <Card className="bg-primary-light dark:bg-primary/15">
            <p className="text-xs opacity-70">Te cuesta al mes</p>
            <p className="text-2xl font-bold tabular-nums text-primary-dark dark:text-primary-light">
              {formatMoney(equivalente, currency)}
            </p>
            <p className="text-xs opacity-70">
              Es lo que tendrías que apartar cada mes para llegar al recibo.
            </p>
          </Card>
        )}

        <TextField
          label="Próximo vencimiento"
          type="date"
          required
          value={valores.nextDueDate}
          onChange={(e) => set("nextDueDate", e.target.value)}
          error={errores.nextDueDate}
          hint="El día que elijas queda fijado: si es el 31, en febrero se cobrará el último día del mes."
        />

        <SelectField
          label="Sale de"
          value={valores.accountId}
          onChange={(e) => set("accountId", e.target.value)}
          error={errores.accountId}
          hint="Hace falta para poder marcarlo como pagado."
        >
          <option value="">Selecciona…</option>
          {(cuentas.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Categoría"
          value={valores.categoryId}
          onChange={(e) => set("categoryId", e.target.value)}
          error={errores.categoryId}
        >
          <option value="">Sin categoría</option>
          {categoriasGasto.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Nota"
          value={valores.note}
          onChange={(e) => set("note", e.target.value)}
          error={errores.note}
        />

        <SwitchField
          label="Activo"
          description="Si lo apagas, sigue en la lista pero no suma ni avisa."
          checked={valores.isActive}
          onCheckedChange={(v) => set("isActive", v)}
        />

        <Button type="submit" full size="lg" disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </form>

      <ConfirmDialog
        open={confirmarBorrado}
        onOpenChange={setConfirmarBorrado}
        title="¿Eliminar el gasto fijo?"
        description="Los pagos que ya registraste NO se borran: son gastos reales que ocurrieron."
        onConfirm={() => {
          if (!id) return;
          borrar.mutate(id, { onSuccess: () => void navigate("/gastos-fijos") });
        }}
      />
    </div>
  );
}
