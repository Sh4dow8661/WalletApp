import { useNavigate } from "react-router";

import { daysInMonth, firstWeekdayOfMonth } from "@/lib/dates.ts";
import { formatMoney } from "@/lib/money.ts";

import { MonthSelector } from "../components/domain.tsx";
import { Card, CardTitle, Skeleton } from "../components/ui/card.tsx";
import { useDailySpend } from "../hooks/api.ts";
import { useMonth } from "../hooks/use-month.tsx";
import { ScreenHeader } from "../layouts/MobileLayout.tsx";
import { cn } from "../lib/cn.ts";

const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * Mapa de calor de gasto diario. Réplica de `CalendarScreen.kt`, **con el bug de
 * §8.6 corregido**.
 *
 * El servidor devuelve los días ya agrupados por fecha local (`yyyy-MM-dd`) en
 * la zona del usuario. La app Android agrupaba por día UTC y luego releía ese
 * valor en hora local, de modo que en UTC−4 casi todo el gasto aparecía un día
 * antes.
 */
export function CalendarScreen() {
  const { year, month, label, currency, previous, next } = useMonth();
  const diario = useDailySpend(year, month);
  const navigate = useNavigate();

  const totalPorDia = new Map(
    (diario.data ?? []).map((d) => [Number(d.day.slice(-2)), d.total]),
  );
  const total = (diario.data ?? []).reduce((suma, d) => suma + d.total, 0);
  const maximo = Math.max(...[...totalPorDia.values(), 0]);

  const dias = daysInMonth(year, month);
  const primerDia = firstWeekdayOfMonth(year, month);
  // Huecos delante para que el día 1 caiga en su columna.
  const celdas: (number | null)[] = [
    ...Array.from({ length: primerDia }, () => null),
    ...Array.from({ length: dias }, (_, i) => i + 1),
  ];

  return (
    <div>
      <ScreenHeader title="Calendario" onBack={() => void navigate(-1)} />

      <div className="space-y-4 p-4">
        <MonthSelector
          label={label}
          onPrevious={previous}
          onNext={next}
          // En escritorio el selector de mes está en la cabecera fija.
          className="xl:hidden"
        />

        <Card className="space-y-3">
          <div className="flex items-baseline justify-between">
            <CardTitle>Gasto diario</CardTitle>
            <span className="text-sm font-semibold tabular-nums">
              {formatMoney(total, currency)}
            </span>
          </div>

          {diario.isPending ? (
            <Skeleton className="h-56" />
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium opacity-50">
                {DIAS_SEMANA.map((d, i) => (
                  <span key={`${d}-${i}`}>{d}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {celdas.map((dia, indice) => {
                  if (dia === null) return <span key={`hueco-${indice}`} />;

                  const gasto = totalPorDia.get(dia) ?? 0;
                  // Intensidad relativa al día de mayor gasto del mes.
                  const intensidad = maximo > 0 ? gasto / maximo : 0;

                  return (
                    <div
                      key={dia}
                      title={
                        gasto > 0 ? `${dia}: ${formatMoney(gasto, currency)}` : `${dia}`
                      }
                      className={cn(
                        "flex aspect-square flex-col items-center justify-center rounded-lg text-xs",
                        gasto === 0 && "bg-black/4 opacity-50 dark:bg-white/8",
                      )}
                      style={
                        gasto > 0
                          ? {
                              // Se parte de 0.15 para que un gasto pequeño se vea.
                              backgroundColor: `rgba(14, 159, 110, ${0.15 + intensidad * 0.75})`,
                              color: intensidad > 0.55 ? "#fff" : undefined,
                            }
                          : undefined
                      }
                    >
                      <span className="font-medium">{dia}</span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-2 text-[10px] opacity-60">
                <span>Menos</span>
                {[0.15, 0.35, 0.55, 0.75, 0.9].map((nivel) => (
                  <span
                    key={nivel}
                    className="size-3 rounded"
                    style={{ backgroundColor: `rgba(14, 159, 110, ${nivel})` }}
                  />
                ))}
                <span>Más</span>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
