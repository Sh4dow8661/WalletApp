import { QueryClient, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useEffect } from "react";
import { BrowserRouter } from "react-router";

import { Avisos } from "./components/Avisos.tsx";
import { useSettings } from "./hooks/api.ts";
import { registrarMutaciones } from "./hooks/mutaciones.ts";
import { MonthProvider } from "./hooks/use-month.tsx";
import { ApiRequestError } from "./lib/api.ts";
import { crearPersister, marcarCacheActualizada } from "./lib/persistencia.ts";
import { ThemeProvider, useTheme } from "./lib/theme.tsx";
import { AppRouter } from "./router.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un minuto: los datos son de un solo usuario y cambian por sus propias
      // acciones, que ya invalidan la caché. Reconsultar más seguido no aporta.
      staleTime: 60_000,
      // Una semana en IndexedDB. Es lo que marca cuánto tiempo puede la app
      // seguir enseñando datos sin haberse conectado.
      gcTime: 1000 * 60 * 60 * 24 * 7,
      // Sin esto, al abrir sin red las consultas quedan "pausadas" esperando
      // conexión y la pantalla se queda con los valores por defecto aunque haya
      // datos en IndexedDB. Con offlineFirst se intenta una vez, falla, y lo
      // restaurado se muestra igualmente (§9).
      networkMode: "offlineFirst",
      retry: (fallos, error) => {
        // Reintentar un 401 no tiene sentido: la sesión no va a volver sola.
        if (error instanceof ApiRequestError && error.isUnauthorized) return false;
        return fallos < 2;
      },
    },
    mutations: {
      // §9: sin red, las escrituras se **pausan** en vez de fallar. TanStack
      // Query las guarda con la caché y las reanuda al volver la conexión,
      // incluso si la app se cerró por medio. Son idempotentes (el id lo genera
      // el cliente), así que reenviarlas no duplica nada.
      networkMode: "offlineFirst",
      retry: 3,
    },
  },
});

// Las funciones de las mutaciones se registran ANTES de restaurar la caché: si
// una escritura pendiente se reanuda y su clave no está registrada, TanStack
// Query no sabe qué ejecutar y la descarta en silencio.
registrarMutaciones(queryClient);

const persister = crearPersister();

/**
 * Alinea el tema guardado en el servidor con el que se está mostrando.
 *
 * El tema se aplica desde `localStorage` antes de que llegue nada del API para
 * evitar el fogonazo blanco; cuando responden los ajustes, si difieren, gana el
 * servidor, que es el que comparten los dispositivos.
 */
function SincronizarTema() {
  const { data: settings } = useSettings();
  const { mode, setMode } = useTheme();

  useEffect(() => {
    if (settings && settings.themeMode !== mode) setMode(settings.themeMode);
    // Solo debe reaccionar a lo que llega del servidor, no a los cambios
    // locales: si no, se pisaría a sí mismo al tocar el selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.themeMode]);

  return null;
}

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        dehydrateOptions: {
          // Las mutaciones pausadas SÍ se guardan: son la cola de escrituras.
          shouldDehydrateMutation: (mutacion) => mutacion.state.isPaused,
        },
      }}
      onSuccess={() => {
        // Con la caché ya restaurada, se reenvía lo que quedó pendiente.
        void queryClient.resumePausedMutations();
      }}
    >
      <ThemeProvider>
        <BrowserRouter>
          <SincronizarTema />
          <RegistrarSelloDeCache />
          {/* El mes seleccionado es compartido: en escritorio lo controla la
              cabecera fija y lo consumen todas las pantallas (§10). */}
          <MonthProvider>
            <AppRouter />
          </MonthProvider>
          <Avisos />
        </BrowserRouter>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

/**
 * Apunta cuándo se refrescaron por última vez los datos.
 *
 * Es lo que permite que el banner de "sin conexión" diga *de cuándo* son los
 * datos que se están viendo, en vez de un "sin conexión" a secas.
 */
function RegistrarSelloDeCache() {
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    return cache.subscribe((evento) => {
      if (evento.type === "updated" && evento.query.state.status === "success") {
        if (onlineManager.isOnline()) marcarCacheActualizada();
      }
    });
  }, []);

  return null;
}
