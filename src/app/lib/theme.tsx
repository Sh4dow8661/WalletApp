import { createContext, use, useEffect, useState } from "react";

import type { ThemeMode } from "@/shared/constants.ts";

/**
 * Tema claro / oscuro / sistema.
 *
 * El modo elegido se guarda en el servidor (`user_settings.theme_mode`), pero se
 * refleja también en `localStorage` para que la primera pintura no parpadee: sin
 * eso habría un fogonazo blanco mientras llega la respuesta del API.
 */

const CLAVE_LOCAL = "walletapp:theme";

interface ThemeContextValue {
  /** Lo que el usuario eligió. */
  mode: ThemeMode;
  /** Lo que se está viendo, ya resuelto el SYSTEM. */
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function leerModoGuardado(): ThemeMode {
  const guardado = localStorage.getItem(CLAVE_LOCAL);
  return guardado === "LIGHT" || guardado === "DARK" || guardado === "SYSTEM"
    ? guardado
    : "SYSTEM";
}

function resolver(mode: ThemeMode): "light" | "dark" {
  if (mode === "LIGHT") return "light";
  if (mode === "DARK") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(leerModoGuardado);
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    resolver(leerModoGuardado()),
  );

  useEffect(() => {
    const aplicar = () => {
      const siguiente = resolver(mode);
      setResolved(siguiente);
      document.documentElement.classList.toggle("dark", siguiente === "dark");
      // Que la barra de estado del móvil acompañe al tema.
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", siguiente === "dark" ? "#121212" : "#0E9F6E");
    };

    aplicar();

    // En modo SYSTEM hay que reaccionar si el sistema cambia mientras la app
    // está abierta.
    if (mode !== "SYSTEM") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", aplicar);
    return () => media.removeEventListener("change", aplicar);
  }, [mode]);

  const setMode = (siguiente: ThemeMode) => {
    localStorage.setItem(CLAVE_LOCAL, siguiente);
    setModeState(siguiente);
  };

  return <ThemeContext value={{ mode, resolved, setMode }}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) throw new Error("useTheme necesita estar dentro de ThemeProvider");
  return context;
}
