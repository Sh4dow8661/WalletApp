import { ArrowDownLeft, ArrowUpRight, ChevronRight, Receipt, Wallet } from "lucide-react";
import { Link } from "react-router";

import {
  availableBalance,
  hasActiveBuffer,
  summarizeAvailability,
} from "@/lib/colchon.ts";
import { cardDebt, isCreditCard, summarizeAccounts } from "@/lib/credit.ts";
import { formatMoney } from "@/lib/money.ts";
import type { Category, Transaction } from "@/shared/types.ts";

import { BarraUtilizacion } from "../components/credito.tsx";
import { CategoryIcon, MoneyText } from "../components/domain.tsx";
import { Card, EmptyState, Skeleton } from "../components/ui/card.tsx";
import {
  useAccounts,
  useCategories,
  useDashboard,
  useTransactions,
} from "../hooks/api.ts";
import { useMonth } from "../hooks/use-month.tsx";
import { cn } from "../lib/cn.ts";
import { Icon } from "../lib/icons.tsx";

/**
 * Inicio. Réplica funcional de `DashboardScreen.kt`: balance total, resumen del
 * mes, lista de cuentas y las últimas transacciones.
 */
export function DashboardScreen() {
  const { year, month, label, from, to, currency } = useMonth();
  const resumen = useDashboard(year, month);
  const cuentas = useAccounts();
  const categorias = useCategories();
  const recientes = useTransactions({ from, to, limit: 10 });
  const resumenCuentas = summarizeAccounts(cuentas.data ?? []);
  const disponibilidad = summarizeAvailability(cuentas.data ?? []);

  return (
    <div className="space-y-4 p-4 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0 md:p-6 xl:grid-cols-3">
      {/* Balance total: solo cuentas con includeInTotal (§8.1). */}
      <Card className="bg-primary text-white md:col-span-2 xl:col-span-1 dark:bg-primary">
        {/* A partir de xl el balance vive en la cabecera fija: repetirlo aquí
            sería decir lo mismo dos veces en la misma pantalla. */}
        <div className="xl:hidden">
          {/* Con colchones, la cifra grande es el DISPONIBLE real: es lo que se
              puede gastar. Lo retenido se dice justo debajo para que no
              parezca que ha desaparecido dinero. Sin colchones no cambia nada
              respecto a antes. */}
          <p className="text-xs opacity-80">
            {disponibilidad.hasAnyBuffer ? "Disponible real" : "Balance total"}
          </p>
          {resumen.isPending ? (
            <Skeleton className="mt-2 h-9 w-40 bg-white/25" />
          ) : (
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {formatMoney(
                disponibilidad.hasAnyBuffer
                  ? disponibilidad.available
                  : (resumen.data?.totalBalance ?? 0),
                currency,
              )}
            </p>
          )}
          {disponibilidad.hasAnyBuffer && (
            <p className="mt-0.5 text-xs opacity-80">
              {formatMoney(disponibilidad.reserved, currency)} retenidos en colchones ·{" "}
              {formatMoney(resumen.data?.totalBalance ?? 0, currency)} en total
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
          <ResumenMes
            icon={ArrowDownLeft}
            label="Ingresos"
            amount={resumen.data?.monthIncome ?? 0}
            currency={currency}
            loading={resumen.isPending}
          />
          <ResumenMes
            icon={ArrowUpRight}
            label="Gastos"
            amount={resumen.data?.monthExpense ?? 0}
            currency={currency}
            loading={resumen.isPending}
          />
        </div>
        <p className="mt-3 text-xs opacity-70 xl:hidden">{label}</p>
        <p className="mt-3 hidden text-xs opacity-70 xl:block">
          Resumen de {label.toLowerCase()}
        </p>
      </Card>

      {/* Utilización agregada de todas las tarjetas. Importa tanto como la de
          cada una: es la cifra que mira el scoring de crédito. */}
      {resumenCuentas.totalPercent !== null && resumenCuentas.totalLevel !== null && (
        <Card className="space-y-2 md:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold opacity-70">Utilización del crédito</h2>
            <Link
              to="/cuentas"
              // min-h-11 = 44 px: el objetivo táctil mínimo de §10, igual que
              // el "Ver todo" de las demás secciones.
              className="-mr-2 flex min-h-11 items-center px-2 text-xs font-medium text-primary hover:underline"
            >
              Ver tarjetas
            </Link>
          </div>
          <BarraUtilizacion
            utilizacion={{
              debt: resumenCuentas.debt,
              limit: resumenCuentas.totalLimit,
              percent: resumenCuentas.totalPercent,
              level: resumenCuentas.totalLevel,
              available: null,
              isOverLimit: false,
            }}
            currency={currency}
          />
        </Card>
      )}

      <section className="space-y-2 md:col-span-1">
        <EncabezadoSeccion titulo="Cuentas" enlace="/cuentas" />
        {cuentas.isPending ? (
          <Skeleton className="h-24" />
        ) : cuentas.data?.length === 0 ? (
          <Card>
            <EmptyState
              icon={Wallet}
              title="Sin cuentas"
              description="Crea una para empezar."
            />
          </Card>
        ) : (
          <div className="grid gap-2">
            {cuentas.data?.map((cuenta) => {
              // En una tarjeta se enseña la deuda en positivo: "300 $ de deuda"
              // se lee de un vistazo, "−300 $" hay que traducirlo cada vez.
              const tarjeta = isCreditCard(cuenta);
              const importe = tarjeta ? cardDebt(cuenta) : cuenta.currentBalance;

              return (
                <Card key={cuenta.id} className="flex items-center gap-3 py-3">
                  <CategoryIcon iconName={cuenta.iconName} colorHex={cuenta.colorHex} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{cuenta.name}</p>
                    {tarjeta ? (
                      <p className="text-xs opacity-50">
                        Deuda
                        {!cuenta.includeInTotal && " · no cuenta en el total"}
                      </p>
                    ) : (
                      !cuenta.includeInTotal && (
                        <p className="text-xs opacity-50">No cuenta en el total</p>
                      )
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        (tarjeta ? importe > 0 : importe < 0) && "text-expense",
                      )}
                    >
                      {formatMoney(importe, currency)}
                    </p>
                    {hasActiveBuffer(cuenta) && (
                      <p
                        className={cn(
                          "text-xs tabular-nums",
                          availableBalance(cuenta) < 0 ? "text-expense" : "opacity-50",
                        )}
                      >
                        {formatMoney(availableBalance(cuenta), currency)} disp.
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2 md:col-span-1">
        <EncabezadoSeccion titulo="Recientes" enlace="/transacciones" />
        {recientes.isPending ? (
          <Skeleton className="h-32" />
        ) : recientes.data?.length === 0 ? (
          <Card>
            <EmptyState
              icon={Receipt}
              title="Sin movimientos este mes"
              description="Toca + para añadir el primero."
            />
          </Card>
        ) : (
          <Card className="divide-y divide-black/5 p-0 dark:divide-white/10">
            {recientes.data?.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                categories={categorias.data ?? []}
                currency={currency}
              />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function ResumenMes({
  icon: Icon,
  label,
  amount,
  currency,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  amount: number;
  currency: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/15 px-3 py-2">
      <span className="flex items-center gap-1 text-xs opacity-80">
        <Icon className="size-3.5" />
        {label}
      </span>
      {loading ? (
        <Skeleton className="mt-1 h-5 w-20 bg-white/25" />
      ) : (
        <p className="text-base font-semibold tabular-nums">
          {formatMoney(amount, currency)}
        </p>
      )}
    </div>
  );
}

function EncabezadoSeccion({ titulo, enlace }: { titulo: string; enlace: string }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold opacity-70">{titulo}</h2>
      <Link
        to={enlace}
        // min-h-11 = 44 px: objetivo táctil mínimo de §10.
        className="-mr-2 flex min-h-11 items-center gap-0.5 px-2 text-xs font-medium text-primary hover:underline"
      >
        Ver todo
        <ChevronRight className="size-3.5" />
      </Link>
    </div>
  );
}

/**
 * Una transacción en una lista. Se reutiliza en Inicio y en Transacciones, así
 * que el aspecto de una fila se define en un solo sitio.
 */
export function TransactionRow({
  transaction,
  categories,
  currency,
}: {
  transaction: Transaction;
  categories: Category[];
  currency: string;
}) {
  const categoria = categories.find((c) => c.id === transaction.categoryId);
  const esTransferencia = transaction.type === "TRANSFER";

  // Las transferencias no tienen categoría: se muestran con su propio icono y
  // se distingue la dirección con el texto.
  const iconName = esTransferencia
    ? "AccountBalance"
    : (categoria?.iconName ?? "Category");
  const colorHex = esTransferencia ? "#3B82F6" : (categoria?.colorHex ?? "#78909C");

  const titulo = esTransferencia
    ? transaction.isOutgoing
      ? "Transferencia enviada"
      : "Transferencia recibida"
    : (categoria?.name ?? "Sin categoría");

  return (
    <Link
      to={`/transacciones/${transaction.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-black/3 dark:hover:bg-white/5"
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: `${colorHex}33`, color: colorHex }}
        aria-hidden
      >
        <Icon name={iconName} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{titulo}</p>
        {transaction.note && (
          <p className="truncate text-xs opacity-60">{transaction.note}</p>
        )}
      </div>
      <MoneyText
        amount={transaction.amount}
        currency={currency}
        type={transaction.type}
        className="shrink-0 text-sm font-semibold"
      />
    </Link>
  );
}
