import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { type Patrimonio, desglosarDisponibleReal } from "@/lib/patrimonio.ts";
import { formatMoney } from "@/lib/money.ts";

import { cn } from "../lib/cn.ts";

/**
 * El «disponible real» y su desglose.
 *
 * Lo usan la cabecera de escritorio, el Dashboard y la pantalla de Cuentas, así
 * que las tres enseñan exactamente la misma cifra por construcción.
 */

/**
 * Cifra principal con su desglose desplegable.
 *
 * `sobreColor` es para la tarjeta verde del Dashboard, donde el texto ya va en
 * blanco: ahí un negativo no puede pintarse de rojo porque no se leería sobre
 * el verde, así que se distingue con el signo y con la etiqueta.
 */
export function DisponibleReal({
  patrimonio,
  currency,
  sobreColor = false,
  compacto = false,
}: {
  patrimonio: Patrimonio;
  currency: string;
  sobreColor?: boolean;
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const negativo = patrimonio.realAvailable < 0;

  // Sin colchones ni deuda, «disponible real» y «balance total» son el mismo
  // número: se usa el nombre de siempre para no inventar jerga.
  const hayAjustes = patrimonio.hasAnyBuffer || patrimonio.hasCardDebt;
  const titulo = hayAjustes ? "Disponible real" : "Balance total";

  return (
    <div className="min-w-0">
      <p className={cn("text-xs", sobreColor ? "opacity-80" : "opacity-60")}>{titulo}</p>
      <p
        className={cn(
          "font-bold tabular-nums",
          compacto ? "text-xl" : "mt-1 text-3xl",
          // Sobre el verde del Dashboard el rojo no se lee: ahí manda el signo.
          negativo && !sobreColor && "text-expense",
        )}
      >
        {formatMoney(patrimonio.realAvailable, currency)}
      </p>

      {hayAjustes && (
        <>
          {/* La otra pregunta, que no se pierde: qué puedo gastar hoy. */}
          <p className={cn("text-xs", sobreColor ? "opacity-80" : "opacity-60")}>
            {formatMoney(patrimonio.spendableToday, currency)} para gastar hoy
            {patrimonio.hasAnyBuffer && " sin tocar colchones"}
          </p>

          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className={cn(
              "mt-1 flex min-h-11 items-center gap-1 text-xs font-medium",
              sobreColor ? "opacity-80 hover:opacity-100" : "text-primary",
            )}
          >
            {abierto ? "Ocultar desglose" : "Ver de dónde sale"}
            <ChevronDown
              aria-hidden
              className={cn("size-3.5 transition-transform", abierto && "rotate-180")}
            />
          </button>

          {abierto && (
            <dl
              className={cn(
                "mt-1 space-y-1 border-t pt-2 text-xs",
                sobreColor ? "border-white/25" : "border-black/8 dark:border-white/10",
              )}
            >
              {desglosarDisponibleReal(patrimonio).map((linea) => (
                <div
                  key={linea.etiqueta}
                  className={cn(
                    "flex items-baseline justify-between gap-3",
                    linea.signo === "resultado" && "font-semibold",
                  )}
                >
                  <dt className={cn(linea.signo !== "resultado" && "opacity-70")}>
                    {linea.signo === "menos" && "− "}
                    {linea.etiqueta}
                  </dt>
                  <dd className="tabular-nums">{formatMoney(linea.importe, currency)}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  );
}
