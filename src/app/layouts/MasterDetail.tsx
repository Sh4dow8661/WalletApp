import { MousePointerClick } from "lucide-react";
import { useOutlet } from "react-router";

import { useBreakpoint } from "../hooks/use-breakpoint.ts";

/**
 * Lista y detalle uno al lado del otro (§10).
 *
 * Solo a partir de 1280 px se ven las dos columnas: es donde §10 pide
 * master-detail. En móvil y tablet cabe una cosa cada vez, así que si hay una
 * ruta hija activa se muestra el detalle y si no, la lista.
 *
 * El detalle llega por `useOutlet()`, que devuelve null cuando no hay ruta hija
 * activa. Así el mismo árbol de rutas sirve para los dos casos y no hay que
 * duplicar la navegación ni mantener un estado de "seleccionado" aparte.
 */
export function MasterDetail({
  lista,
  vacio,
}: {
  lista: React.ReactNode;
  /** Qué enseñar en el panel derecho cuando no hay nada seleccionado. */
  vacio?: { titulo: string; descripcion: string };
}) {
  const detalle = useOutlet();
  const dosColumnas = useBreakpoint() === "desktop";

  if (!dosColumnas) return <>{detalle ?? lista}</>;

  return (
    <div className="flex min-h-[calc(100dvh-3.75rem)]">
      <div className="w-[26rem] shrink-0 overflow-y-auto border-r border-black/8 dark:border-white/10">
        {lista}
      </div>

      <div className="min-w-0 flex-1">
        {detalle ?? (
          <div className="grid h-full place-items-center p-10 text-center">
            <div className="max-w-xs space-y-2">
              <MousePointerClick className="mx-auto size-10 opacity-20" aria-hidden />
              <p className="font-medium">{vacio?.titulo ?? "Nada seleccionado"}</p>
              <p className="text-sm opacity-60">
                {vacio?.descripcion ?? "Elige un elemento de la lista para verlo aquí."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
