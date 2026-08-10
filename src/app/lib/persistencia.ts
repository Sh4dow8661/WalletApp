import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { createStore, del, get, set } from "idb-keyval";

/**
 * Persistencia de la caché de TanStack Query en IndexedDB (§9).
 *
 * Es lo que hace que la app abra sin red mostrando los últimos datos conocidos
 * en vez de una pantalla vacía. Se usa IndexedDB y no `localStorage` porque la
 * caché puede pasar de los 5 MB que este admite, y porque `localStorage` es
 * síncrono y bloquea el hilo principal al escribir.
 */

const ALMACEN = createStore("walletapp", "cache-consultas");
const CLAVE = "react-query";

export function crearPersister(): Persister {
  return {
    persistClient: async (cliente: PersistedClient) => {
      try {
        await set(CLAVE, cliente, ALMACEN);
      } catch {
        // Sin cuota o en modo privado: se sigue funcionando, solo que sin
        // datos al abrir offline. No es motivo para romper la app.
      }
    },
    restoreClient: async () => {
      try {
        return await get<PersistedClient>(CLAVE, ALMACEN);
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await del(CLAVE, ALMACEN);
      } catch {
        // Nada que hacer.
      }
    },
  };
}

/** Momento de la última escritura de la caché, para el banner de "sin conexión". */
const CLAVE_SELLO = "walletapp:cache-actualizada";

export function marcarCacheActualizada(momento: number = Date.now()): void {
  try {
    localStorage.setItem(CLAVE_SELLO, String(momento));
  } catch {
    // Modo privado: el banner dirá simplemente que no hay conexión.
  }
}

export function leerCacheActualizada(): number | null {
  try {
    const valor = localStorage.getItem(CLAVE_SELLO);
    return valor ? Number(valor) : null;
  } catch {
    return null;
  }
}
