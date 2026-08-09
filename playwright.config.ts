import { defineConfig, devices } from "@playwright/test";

/**
 * Configuración de los tests de extremo a extremo.
 *
 * Levanta el `pnpm dev` real —Vite más el Worker en workerd, con la D1 local—,
 * así que las pruebas atraviesan la misma pila que la app en producción.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Los tests comparten la misma D1 local, así que corren en serie: en paralelo
  // se pisarían los datos entre sí.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],

  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },

  projects: [
    // Entra una sola vez y guarda la cookie. Sin esto, cada test volvería a
    // hacer login y chocaría con el rate limiting de §11, que queremos activo.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/usuario.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
