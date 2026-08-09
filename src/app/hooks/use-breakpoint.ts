import { useEffect, useState } from "react";

/**
 * Punto de ruptura activo, según los breakpoints por defecto de Tailwind (§10).
 *
 * Se resuelve con `matchMedia` y no midiendo el ancho en un `resize`: así no hay
 * un render por píxel al girar el teléfono, solo uno al cruzar el umbral.
 */
export type Breakpoint = "mobile" | "tablet" | "desktop";

const CONSULTA_TABLET = "(min-width: 768px)";
const CONSULTA_ESCRITORIO = "(min-width: 1280px)";

function actual(): Breakpoint {
  if (typeof window === "undefined") return "mobile";
  if (window.matchMedia(CONSULTA_ESCRITORIO).matches) return "desktop";
  if (window.matchMedia(CONSULTA_TABLET).matches) return "tablet";
  return "mobile";
}

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(actual);

  useEffect(() => {
    const consultas = [
      window.matchMedia(CONSULTA_TABLET),
      window.matchMedia(CONSULTA_ESCRITORIO),
    ];
    const alCambiar = () => setBreakpoint(actual());

    for (const consulta of consultas) consulta.addEventListener("change", alCambiar);
    return () => {
      for (const consulta of consultas) consulta.removeEventListener("change", alCambiar);
    };
  }, []);

  return breakpoint;
}

/** Atajo para lo más habitual: decidir entre layout móvil y el resto. */
export function useIsMobile(): boolean {
  return useBreakpoint() === "mobile";
}
