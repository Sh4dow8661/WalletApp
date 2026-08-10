import { AlertTriangle } from "lucide-react";
import { Link } from "react-router";

import {
  CREDIT_LEVEL_LABELS,
  CREDIT_LEVEL_MESSAGES,
  type CardUtilization,
  type CreditLevel,
} from "@/lib/credit.ts";
import { formatMoney } from "@/lib/money.ts";

import { cn } from "../lib/cn.ts";

/**
 * Utilización de crédito.
 *
 * ACCESIBILIDAD: el color nunca va solo. Cada nivel enseña además su etiqueta
 * ("Atención", "Crítico"…) y una frase que explica qué significa, para que
 * alguien que no distinga el verde del rojo se entere igual (§10). El
 * porcentaje se anuncia con `role="meter"` para los lectores de pantalla.
 */

/** Clases por nivel. El crítico se separa del "malo" con más peso visual. */
const COLOR_TEXTO: Record<CreditLevel, string> = {
  excelente: "text-income",
  bien: "text-income",
  aviso: "text-warning",
  malo: "text-expense",
  critico: "text-expense",
};

const COLOR_BARRA: Record<CreditLevel, string> = {
  excelente: "bg-income",
  bien: "bg-income",
  aviso: "bg-warning",
  malo: "bg-expense",
  critico: "bg-expense",
};

export function NivelBadge({
  level,
  className,
}: {
  level: CreditLevel;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        "bg-current/10",
        COLOR_TEXTO[level],
        className,
      )}
    >
      {level === "critico" && <AlertTriangle className="size-3" aria-hidden />}
      {CREDIT_LEVEL_LABELS[level]}
    </span>
  );
}

/**
 * Barra de utilización de una tarjeta.
 *
 * Sin límite configurado no se dibuja ninguna barra ni se inventa un
 * porcentaje: se dice lo que pasa y se ofrece el enlace para arreglarlo.
 */
export function BarraUtilizacion({
  utilizacion,
  currency,
  enlaceConfigurar,
  compacta = false,
}: {
  utilizacion: CardUtilization;
  currency: string;
  /** A dónde va el "configúralo" cuando falta el límite. */
  enlaceConfigurar?: string;
  compacta?: boolean;
}) {
  const { percent, level, debt, limit, available, isOverLimit } = utilizacion;

  if (percent === null || level === null) {
    return (
      <p className="text-xs opacity-60">
        Sin límite configurado
        {enlaceConfigurar && (
          <>
            {" · "}
            <Link to={enlaceConfigurar} className="text-primary hover:underline">
              configúralo
            </Link>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("text-sm font-bold tabular-nums", COLOR_TEXTO[level])}>
          {percent} %
        </span>
        <NivelBadge level={level} />
      </div>

      <div
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Utilización: ${percent} %, ${CREDIT_LEVEL_LABELS[level].toLowerCase()}`}
        className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
      >
        <div
          className={cn("h-full rounded-full transition-[width]", COLOR_BARRA[level])}
          // Por encima del 100 % la barra se queda llena: no puede desbordar su
          // carril, y el número ya dice que hay sobregiro.
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>

      {!compacta && (
        <p className="text-xs opacity-70">
          {formatMoney(debt, currency)} de {formatMoney(limit ?? 0, currency)}
          {available !== null && !isOverLimit && (
            <> · quedan {formatMoney(available, currency)}</>
          )}
        </p>
      )}

      <p
        className={cn("text-xs", level === "critico" ? COLOR_TEXTO[level] : "opacity-70")}
      >
        {isOverLimit
          ? "Has pasado el límite de la tarjeta."
          : CREDIT_LEVEL_MESSAGES[level]}
      </p>
    </div>
  );
}
