import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter } from "react-router";

import { useSettings } from "./hooks/api.ts";
import { MonthProvider } from "./hooks/use-month.tsx";
import { ApiRequestError } from "./lib/api.ts";
import { ThemeProvider, useTheme } from "./lib/theme.tsx";
import { AppRouter } from "./router.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un minuto: los datos son de un solo usuario y cambian por sus propias
      // acciones, que ya invalidan la caché. Reconsultar más seguido no aporta.
      staleTime: 60_000,
      retry: (fallos, error) => {
        // Reintentar un 401 no tiene sentido: la sesión no va a volver sola.
        if (error instanceof ApiRequestError && error.isUnauthorized) return false;
        return fallos < 2;
      },
    },
  },
});

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
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <SincronizarTema />
          {/* El mes seleccionado es compartido: en escritorio lo controla la
              cabecera fija y lo consumen todas las pantallas (§10). */}
          <MonthProvider>
            <AppRouter />
          </MonthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
