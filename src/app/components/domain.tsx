import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatMoney, formatSignedMoney } from "@/lib/money.ts";
import { ICON_NAMES, type IconName } from "@/shared/constants.ts";

import { cn } from "../lib/cn.ts";
import { Icon } from "../lib/icons.tsx";

/** Componentes propios del dominio, compartidos por todas las pantallas. */

/** Círculo de color con el icono de la categoría o la cuenta. */
export function CategoryIcon({
  iconName,
  colorHex,
  size = 40,
  className,
}: {
  iconName: string;
  colorHex: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        className,
      )}
      style={{
        width: size,
        height: size,
        // Mismo tratamiento que el original: fondo al 20% y trazo al 100%.
        backgroundColor: `${colorHex}33`,
        color: colorHex,
      }}
      aria-hidden
    >
      <Icon name={iconName} style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}

/** Importe con color y signo según sea ingreso, gasto o transferencia. */
export function MoneyText({
  amount,
  currency,
  type,
  className,
  signed = true,
}: {
  amount: number;
  currency: string;
  type?: "INCOME" | "EXPENSE" | "TRANSFER";
  className?: string;
  signed?: boolean;
}) {
  const esGasto = type === "EXPENSE";
  const color =
    type === "INCOME"
      ? "text-income"
      : type === "EXPENSE"
        ? "text-expense"
        : type === "TRANSFER"
          ? "text-transfer"
          : undefined;

  // Las transferencias no llevan signo: no son ni ingreso ni gasto.
  const texto =
    signed && type && type !== "TRANSFER"
      ? formatSignedMoney(amount, esGasto, currency)
      : formatMoney(amount, currency);

  return <span className={cn("tabular-nums", color, className)}>{texto}</span>;
}

/** Balance grande, en rojo si es negativo. */
export function BalanceText({
  amount,
  currency,
  className,
}: {
  amount: number;
  currency: string;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", amount < 0 && "text-expense", className)}>
      {formatMoney(amount, currency)}
    </span>
  );
}

/** Navegador de mes: ‹ Agosto 2026 › */
export function MonthSelector({
  label,
  onPrevious,
  onNext,
  className,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <button
        type="button"
        onClick={onPrevious}
        aria-label="Mes anterior"
        className="grid size-11 place-items-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
      >
        <ChevronLeft className="size-5" />
      </button>
      <span className="text-sm font-semibold">{label}</span>
      <button
        type="button"
        onClick={onNext}
        aria-label="Mes siguiente"
        className="grid size-11 place-items-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}

/** Selector visual de icono, con los 17 nombres admitidos. */
export function IconPicker({
  label,
  value,
  colorHex,
  onChange,
}: {
  label: string;
  value: string;
  colorHex: string;
  onChange: (icon: IconName) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
        {ICON_NAMES.map((name) => {
          const seleccionado = value === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              aria-label={name}
              aria-pressed={seleccionado}
              className={cn(
                "grid size-11 place-items-center rounded-xl transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                seleccionado
                  ? "ring-2 ring-primary"
                  : "bg-black/5 hover:bg-black/10 dark:bg-white/8 dark:hover:bg-white/15",
              )}
              style={
                seleccionado
                  ? { backgroundColor: `${colorHex}33`, color: colorHex }
                  : undefined
              }
            >
              <Icon name={name} className="size-5" />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Barra de progreso de un presupuesto, con color según lo cerca que esté. */
export function ProgressBar({
  progress,
  isOverBudget,
  isNearLimit,
  className,
}: {
  progress: number;
  isOverBudget?: boolean;
  isNearLimit?: boolean;
  className?: string;
}) {
  const color = isOverBudget ? "bg-expense" : isNearLimit ? "bg-warning" : "bg-primary";
  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15",
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", color)}
        style={{ width: `${Math.min(progress * 100, 100)}%` }}
      />
    </div>
  );
}
