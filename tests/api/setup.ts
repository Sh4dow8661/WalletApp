import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll } from "vitest";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}

/**
 * Aplica las migraciones reales de `migrations/` a la D1 de pruebas.
 *
 * Se usan las mismas migraciones que en producción a propósito: así los tests
 * también verifican que el DDL es válido y que los CHECK y las claves foráneas
 * hacen lo que se espera.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
