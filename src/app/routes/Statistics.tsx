import { BarChart3 } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

import { formatMoney } from "@/lib/money.ts";

import { MonthSelector } from "../components/domain.tsx";
import { Card, CardTitle, EmptyState, Skeleton } from "../components/ui/card.tsx";
import { useCategories, useMonthlyTrend, useSpendByCategory } from "../hooks/api.ts";
import { useMonth } from "../hooks/use-month.ts";
import { useTheme } from "../lib/theme.tsx";
import { ScreenHeader } from "../layouts/MobileLayout.tsx";

/**
 * Formateador para los tooltips de Recharts.
 *
 * Su tipo `Formatter` admite `ValueType | undefined`, así que hay que aceptar
 * lo que llegue y normalizarlo en vez de declarar `number` directamente.
 */
function formatearTooltip(currency: string) {
  return (valor: unknown) => formatMoney(typeof valor === "number" ? valor : 0, currency);
}

/**
 * Estadísticas. Réplica de `StatisticsScreen.kt`: tarta de gasto por categoría
 * del mes elegido y barras con la tendencia de los últimos 6 meses.
 *
 * Los gráficos van siempre dentro de `ResponsiveContainer` (§10), así que se
 * adaptan solos al ancho sin medir nada a mano.
 */
export function StatisticsScreen() {
  const { year, month, label, currency, previous, next } = useMonth();
  const porCategoria = useSpendByCategory(year, month);
  const tendencia = useMonthlyTrend(year, month);
  const categorias = useCategories();
  const { resolved } = useTheme();

  const colorEje = resolved === "dark" ? "#9CA3AF" : "#6B7280";

  const datosTarta = (porCategoria.data ?? []).map((entrada) => {
    const categoria = categorias.data?.find((c) => c.id === entrada.categoryId);
    return {
      // La clave es el id, NUNCA el nombre: mientras las categorías cargan,
      // todas se llaman "Sin categoría", y con nombres repetidos React deja
      // nodos huérfanos que aparecen como entradas fantasma en la leyenda.
      id: entrada.categoryId ?? "sin-categoria",
      name: categoria?.name ?? "Sin categoría",
      value: entrada.total,
      color: categoria?.colorHex ?? "#78909C",
    };
  });

  const totalMes = datosTarta.reduce((suma, d) => suma + d.value, 0);

  return (
    <div>
      <ScreenHeader title="Estadísticas" />

      <div className="space-y-4 p-4">
        <MonthSelector label={label} onPrevious={previous} onNext={next} />

        <Card className="space-y-3">
          <div className="flex items-baseline justify-between">
            <CardTitle>Gasto por categoría</CardTitle>
            <span className="text-sm font-semibold tabular-nums">
              {formatMoney(totalMes, currency)}
            </span>
          </div>

          {porCategoria.isPending ? (
            <Skeleton className="h-56" />
          ) : datosTarta.length === 0 ? (
            <EmptyState icon={BarChart3} title="Sin gastos este mes" />
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={datosTarta}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {datosTarta.map((entrada) => (
                        <Cell key={entrada.id} fill={entrada.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={formatearTooltip(currency)}
                      contentStyle={{
                        borderRadius: 12,
                        border: "none",
                        fontSize: 12,
                        backgroundColor: resolved === "dark" ? "#262626" : "#ffffff",
                        color: resolved === "dark" ? "#F3F4F6" : "#111827",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Leyenda propia: la de Recharts se corta en pantallas estrechas. */}
              <ul className="space-y-1.5">
                {datosTarta.map((entrada) => (
                  <li key={entrada.id} className="flex items-center gap-2 text-sm">
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: entrada.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{entrada.name}</span>
                    <span className="shrink-0 tabular-nums opacity-70">
                      {totalMes > 0 ? Math.round((entrada.value / totalMes) * 100) : 0}%
                    </span>
                    <span className="shrink-0 tabular-nums font-medium">
                      {formatMoney(entrada.value, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="space-y-3">
          <CardTitle>Tendencia de gasto · 6 meses</CardTitle>
          {tendencia.isPending ? (
            <Skeleton className="h-48" />
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={tendencia.data ?? []}
                  margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
                >
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: colorEje }}
                  />
                  <Tooltip
                    cursor={{ fill: resolved === "dark" ? "#ffffff10" : "#00000008" }}
                    formatter={formatearTooltip(currency)}
                    contentStyle={{
                      borderRadius: 12,
                      border: "none",
                      fontSize: 12,
                      backgroundColor: resolved === "dark" ? "#262626" : "#ffffff",
                      color: resolved === "dark" ? "#F3F4F6" : "#111827",
                    }}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {(tendencia.data ?? []).map((punto) => (
                      <Cell
                        key={`${punto.year}-${punto.month}`}
                        // El mes que se está viendo se resalta.
                        fill={
                          punto.year === year && punto.month === month
                            ? "#0E9F6E"
                            : "#0E9F6E66"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
