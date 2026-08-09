import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Configuración de los tests unitarios. Deliberadamente separada de
 * vite.config.ts y sin el plugin de Cloudflare: Vitest inyecta
 * `resolve.external` con los builtins de Node en todos los entornos, y el plugin
 * lo rechaza en el entorno del Worker.
 *
 * Los tests de integración de la API contra D1 local llegan en la Fase 2 con
 * @cloudflare/vitest-pool-workers, que trae su propia configuración.
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  test: {
    projects: [
      {
        // El dominio es TypeScript puro: corre en Node, que es más rápido.
        extends: true,
        test: {
          name: "dominio",
          environment: "node",
          include: ["src/lib/**/*.test.ts", "src/shared/**/*.test.ts"],
        },
      },
      {
        // Los componentes necesitan DOM.
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/app/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup-ui.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/shared/**", "src/worker/**"],
    },
  },
});
