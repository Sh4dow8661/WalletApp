import { createContext, use, useState } from "react";

import { addMonths, monthLabel, monthRange, yearMonth } from "@/lib/dates.ts";
import { DEFAULT_TIME_ZONE } from "@/shared/constants.ts";

import { useSettings } from "./api.ts";

/**
 * Mes seleccionado, compartido por toda la app.
 *
 * Tiene que ser estado compartido y no local de cada pantalla: en escritorio el
 * selector de mes vive en la cabecera fija (§10) y controla lo que muestran el
 * dashboard, las transacciones, las estadísticas y el calendario. Con un
 * `useState` por pantalla, mover el mes en la cabecera no cambiaría nada.
 *
 * El mes se calcula en la **zona del usuario**, no en la del navegador: es lo
 * que hace que el rango coincida con el que usa el servidor para los agregados
 * (§8.6).
 */

interface MonthContextValue {
  year: number;
  month: number;
  label: string;
  /** Primer instante del mes, en epoch millis. */
  from: number;
  /** Último instante del mes, en epoch millis. */
  to: number;
  timeZone: string;
  currency: string;
  previous: () => void;
  next: () => void;
  reset: () => void;
}

const MonthContext = createContext<MonthContextValue | null>(null);

/**
 * Instante en que se montó el proveedor.
 *
 * Llamar a `Date.now()` durante el render es impuro: si React vuelve a
 * renderizar, la "fecha de hoy" cambiaría sola.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}

export function MonthProvider({ children }: { children: React.ReactNode }) {
  const { data: settings } = useSettings();
  const timeZone = settings?.timeZone ?? DEFAULT_TIME_ZONE;
  const ahora = useNow();

  const [seleccion, setSeleccion] = useState(() => yearMonth(ahora, timeZone));
  const { from, to } = monthRange(seleccion.year, seleccion.month, timeZone);

  const valor: MonthContextValue = {
    year: seleccion.year,
    month: seleccion.month,
    label: monthLabel(seleccion.year, seleccion.month),
    from,
    to,
    timeZone,
    currency: settings?.currency ?? "USD",
    previous: () => setSeleccion((s) => addMonths(s.year, s.month, -1)),
    next: () => setSeleccion((s) => addMonths(s.year, s.month, 1)),
    reset: () => setSeleccion(yearMonth(ahora, timeZone)),
  };

  return <MonthContext value={valor}>{children}</MonthContext>;
}

export function useMonth(): MonthContextValue {
  const context = use(MonthContext);
  if (!context) throw new Error("useMonth necesita estar dentro de MonthProvider");
  return context;
}

/** Ajustes de presentación: moneda y zona, con valores por defecto. */
export function useDisplaySettings() {
  const { data: settings } = useSettings();
  return {
    currency: settings?.currency ?? "USD",
    timeZone: settings?.timeZone ?? DEFAULT_TIME_ZONE,
    themeMode: settings?.themeMode ?? "SYSTEM",
  };
}
