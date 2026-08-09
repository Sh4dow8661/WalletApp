import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de PWA, contra el **build servido** (`pnpm preview`).
 *
 * Van en su propia configuración porque el service worker está desactivado en
 * `vite dev` (con él puesto, el HMR serviría archivos cacheados y los cambios no
 * se verían), así que la única forma de probarlo de verdad es sobre el build.
 *
 * Tampoco reutilizan la sesión del otro proyecto: cada test crea la suya, para
 * poder controlar cuándo hay red y cuándo no.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /pwa\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],

  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "pnpm build && pnpm preview",
    url: "http://localhost:4173/api/health",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
