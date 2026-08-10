import { fileURLToPath } from "node:url";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Tests de integración del API.
 *
 * Corren dentro de **workerd de verdad**, con una D1 real (la local de
 * Miniflare) y las migraciones de `migrations/` aplicadas. No hay mocks de la
 * base: si una consulta está mal escrita o un CHECK del esquema salta, el test
 * falla igual que fallaría en producción.
 *
 * Cada archivo de test tiene su propio almacenamiento aislado, así que no
 * comparten filas entre sí.
 */
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(
        fileURLToPath(new URL("../../migrations", import.meta.url)),
      );

      return {
        wrangler: {
          configPath: fileURLToPath(new URL("../../wrangler.jsonc", import.meta.url)),
        },
        miniflare: {
          bindings: {
            // Las migraciones se pasan como binding para poder aplicarlas desde
            // el setup, que sí corre dentro del Worker.
            TEST_MIGRATIONS: migrations,
            // Secreto fijo y sin valor real: es solo para firmar sesiones de
            // prueba dentro de un runtime efímero.
            BETTER_AUTH_SECRET: "secreto-de-pruebas-no-usar-en-produccion-0123456789",
            ALLOW_SIGNUP: "true",
          },
        },
      };
    }),
  ],

  resolve: {
    alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) },
  },

  test: {
    name: "api",
    include: ["**/*.test.ts"],
    setupFiles: ["./setup.ts"],
  },
});
