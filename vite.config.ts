import { fileURLToPath, URL } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Levanta el Worker en workerd de verdad durante `vite dev`, con sus bindings.
    // Lee la configuración de wrangler.jsonc automáticamente.
    cloudflare(),
  ],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  build: {
    outDir: "dist",
    sourcemap: true,
  },
});

// La configuración de Vitest vive aparte, en vitest.config.ts. No se puede
// reutilizar esta: Vitest inyecta `resolve.external` con los builtins de Node en
// todos los entornos, y el plugin de Cloudflare rechaza eso en el entorno del
// Worker (que no tiene los builtins de Node). Los tests unitarios no necesitan
// workerd; los de integración de la API usarán @cloudflare/vitest-pool-workers
// en la Fase 2.
