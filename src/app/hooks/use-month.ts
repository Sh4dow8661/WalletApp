import { useState } from "react";

import { addMonths, monthLabel, monthRange, yearMonth } from "@/lib/dates.ts";
import { DEFAULT_TIME_ZONE } from "@/shared/constants.ts";

import { useSettings } from "./api.ts";

/**
 * Mes seleccionado, navegable con ‹ ›.
 *
 * El mes se calcula en la **zona del usuario**, no en la del navegador: es lo
 * que hace que el rango coincida con el que usa el servidor para los agregados
 * (§8.6). Mientras los ajustes cargan se usa el valor por defecto, que es el
 * mismo que sembró el registro.
 */
export function useMonth() {
  const { data: settings } = useSettings();
  const timeZone = settings?.timeZone ?? DEFAULT_TIME_ZONE;

  const [seleccion, setSeleccion] = useState(() => yearMonth(Date.now(), timeZone));

  const { from, to } = monthRange(seleccion.year, seleccion.month, timeZone);

  return {
    year: seleccion.year,
    month: seleccion.month,
    label: monthLabel(seleccion.year, seleccion.month),
    from,
    to,
    timeZone,
    currency: settings?.currency ?? "USD",
    previous: () => setSeleccion((s) => addMonths(s.year, s.month, -1)),
    next: () => setSeleccion((s) => addMonths(s.year, s.month, 1)),
    reset: () => setSeleccion(yearMonth(Date.now(), timeZone)),
  };
}

/**
 * Instante en que se montó el componente.
 *
 * Llamar a `Date.now()` durante el render es impuro: si React vuelve a
 * renderizar, la "fecha de hoy" cambiaría sola. Congelarla al montar es además
 * lo que se quiere en un formulario — la fecha por defecto se fija al abrirlo,
 * no se mueve mientras se rellena.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
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
