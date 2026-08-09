import { onlineManager, useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { CloudOff, RefreshCw, UploadCloud } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { leerCacheActualizada } from "../lib/persistencia.ts";
import { alHaberActualizacion, aplicarNuevaVersion } from "../lib/pwa.ts";
import { cn } from "../lib/cn.ts";

/**
 * Avisos que flotan sobre la app: sin conexión, escrituras pendientes y versión
 * nueva disponible (§9).
 *
 * Van juntos a propósito: los tres compiten por el mismo sitio de la pantalla y
 * así se apilan sin taparse entre ellos ni tapar la barra de navegación.
 */

/** Estado de conexión, tomado del `onlineManager` de TanStack Query. */
function useEstaEnLinea(): boolean {
  return useSyncExternalStore(
    (alCambiar) => onlineManager.subscribe(alCambiar),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/** Cuántas escrituras están esperando a que vuelva la red. */
function usePendientes(): number {
  const queryClient = useQueryClient();
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    const cache = queryClient.getMutationCache();
    const recontar = () =>
      setPendientes(cache.getAll().filter((m) => m.state.isPaused).length);

    recontar();
    return cache.subscribe(recontar);
  }, [queryClient]);

  return pendientes;
}

export function Avisos() {
  const enLinea = useEstaEnLinea();
  const restaurando = useIsRestoring();
  const pendientes = usePendientes();
  const [hayVersionNueva, setHayVersionNueva] = useState(false);

  useEffect(() => alHaberActualizacion(setHayVersionNueva), []);

  // Mientras se restaura la caché no se sabe todavía qué hay; avisar de "sin
  // conexión" en ese instante sería un parpadeo sin información.
  if (restaurando) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4",
        // Por encima de la barra inferior en móvil.
        "bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4",
      )}
    >
      {!enLinea && <BannerSinConexion pendientes={pendientes} />}
      {enLinea && pendientes > 0 && <BannerEnviando pendientes={pendientes} />}
      {hayVersionNueva && <BannerVersionNueva />}
    </div>
  );
}

function BannerSinConexion({ pendientes }: { pendientes: number }) {
  const actualizada = leerCacheActualizada();

  return (
    <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900">
      <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Sin conexión</p>
        <p className="text-xs opacity-70">
          {actualizada
            ? `Mostrando los datos guardados el ${formatearMomento(actualizada)}.`
            : "Mostrando los últimos datos guardados."}
          {pendientes > 0 &&
            ` ${pendientes} cambio${pendientes === 1 ? "" : "s"} se enviará${pendientes === 1 ? "" : "n"} al volver la red.`}
        </p>
      </div>
    </div>
  );
}

function BannerEnviando({ pendientes }: { pendientes: number }) {
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm text-white shadow-lg">
      <UploadCloud className="size-4 shrink-0 animate-pulse" aria-hidden />
      <span>
        Enviando {pendientes} cambio{pendientes === 1 ? "" : "s"}…
      </span>
    </div>
  );
}

/**
 * Aviso de versión nueva.
 *
 * §9 es explícito: nada de recargas silenciosas a mitad de un formulario. La
 * app nueva ya está descargada y espera; el usuario decide cuándo.
 */
function BannerVersionNueva() {
  const [recargando, setRecargando] = useState(false);

  return (
    <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900">
      <RefreshCw
        className={cn("size-4 shrink-0", recargando && "animate-spin")}
        aria-hidden
      />
      <span className="flex-1">Nueva versión disponible</span>
      <button
        type="button"
        disabled={recargando}
        onClick={() => {
          setRecargando(true);
          void aplicarNuevaVersion();
        }}
        className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 font-medium hover:bg-white/25 disabled:opacity-60 dark:bg-black/10 dark:hover:bg-black/20"
      >
        Recargar
      </button>
    </div>
  );
}

/** "hoy a las 14:30" o "el 7 de agosto a las 09:15". */
function formatearMomento(millis: number): string {
  const fecha = new Date(millis);
  const hora = new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);

  const hoy = new Date();
  const esHoy =
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate();

  if (esHoy) return `hoy a las ${hora}`;

  const dia = new Intl.DateTimeFormat("es", { day: "numeric", month: "long" }).format(
    fecha,
  );
  return `el ${dia} a las ${hora}`;
}
