import { Hono } from "hono";

import { createAuth } from "./auth.ts";
import { type AppEnv, requireSession } from "./context.ts";
import accounts from "./routes/accounts.ts";
import budgets from "./routes/budgets.ts";
import categories from "./routes/categories.ts";
import settings from "./routes/settings.ts";
import stats from "./routes/stats.ts";
import transactions from "./routes/transactions.ts";
import { ValidationError } from "./validation.ts";

/**
 * Punto de entrada del Worker.
 *
 * Un solo Worker sirve la API y la SPA. `wrangler.jsonc` manda a `/api/*` aquí
 * (`run_worker_first`) y deja el resto a los assets estáticos, con
 * `not_found_handling: "single-page-application"` para que React Router pueda
 * enrutar en el cliente.
 */
const app = new Hono<AppEnv>();

app.get("/api/health", (c) =>
  c.json({ ok: true, servicio: "walletapp", runtime: navigator.userAgent }),
);

/**
 * Better Auth se monta antes del guard: son justo las rutas que se usan **sin**
 * sesión (registro, login, recuperación).
 */
app.on(["GET", "POST"], "/api/auth/*", (c) =>
  createAuth(c.env, c.req.raw).handler(c.req.raw),
);

/**
 * A partir de aquí todo exige sesión y filtra por el usuario de la sesión.
 * Que el frontend esconda un botón no es seguridad (§11).
 */
app.use("/api/*", requireSession);

app.route("/api/accounts", accounts);
app.route("/api/categories", categories);
app.route("/api/transactions", transactions);
app.route("/api/budgets", budgets);
app.route("/api/settings", settings);
app.route("/api/stats", stats);

app.all("/api/*", (c) => c.json({ error: "Ruta no encontrada" }, 404));

/**
 * Manejador de errores.
 *
 * Los de validación salen con 400 y el detalle por campo, que es lo que la UI
 * necesita para marcar el formulario. Cualquier otro se registra y sale como 500
 * genérico: un mensaje de error de SQLite puede filtrar nombres de tablas y
 * estructura, y no le sirve de nada al cliente.
 */
app.onError((err, c) => {
  if (err instanceof ValidationError) {
    return c.json({ error: err.message, fields: err.fields }, 400);
  }
  console.error("Error no controlado:", err);
  return c.json({ error: "Error interno del servidor" }, 500);
});

export default app;
