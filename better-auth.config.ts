import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

/**
 * Configuración SOLO para la CLI de Better Auth (`pnpm auth:generate`).
 *
 * La CLI necesita importar una instancia estática para deducir qué tablas hacen
 * falta, pero la instancia real (src/worker/auth.ts) se construye por petición
 * porque `env.DB` únicamente existe dentro del handler del Worker. Para generar
 * el esquema no se ejecuta ninguna consulta, así que aquí basta con un `db` vacío.
 *
 * Este archivo no se importa nunca en tiempo de ejecución. Si cambias las
 * opciones que afectan al esquema en src/worker/auth.ts (proveedores sociales,
 * plugins, campos adicionales), replícalas aquí y vuelve a generar.
 */
export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
});
