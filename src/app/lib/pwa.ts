import { registerSW } from "virtual:pwa-register";

/**
 * Registro del service worker (§9).
 *
 * El registro se hace a mano en vez de dejar que el plugin lo inyecte, porque
 * hace falta la señal de "hay una versión nueva" para poder enseñar el aviso en
 * lugar de recargar por sorpresa.
 */

type Escucha = (hayActualizacion: boolean) => void;

let aplicarActualizacion: (() => Promise<void>) | null = null;
const escuchas = new Set<Escucha>();
let hayActualizacionPendiente = false;

function avisar(estado: boolean) {
  hayActualizacionPendiente = estado;
  for (const escucha of escuchas) escucha(estado);
}

export function registrarServiceWorker(): void {
  // En desarrollo no hay service worker (ver devOptions en vite.config.ts).
  if (!("serviceWorker" in navigator)) return;

  const actualizar = registerSW({
    onNeedRefresh() {
      // Hay una versión nueva esperando. No se activa sola: §9 pide avisar y
      // dejar que el usuario recargue cuando le venga bien, para no perder lo
      // que esté escribiendo en un formulario.
      avisar(true);
    },
    onOfflineReady() {
      // El shell ya está en caché: la app abrirá sin red.
    },
  });

  aplicarActualizacion = async () => {
    // `true` recarga la página en cuanto el nuevo SW toma el control.
    await actualizar(true);
  };
}

/** Se suscribe al aviso de versión nueva. Devuelve la función para desuscribirse. */
export function alHaberActualizacion(escucha: Escucha): () => void {
  escuchas.add(escucha);
  // Si la actualización llegó antes de montar el componente, se avisa ya.
  if (hayActualizacionPendiente) escucha(true);
  return () => escuchas.delete(escucha);
}

/** Activa la versión nueva y recarga. */
export async function aplicarNuevaVersion(): Promise<void> {
  await aplicarActualizacion?.();
}
