import { Hono } from "hono";

/**
 * Punto de entrada del Worker. Sirve la API en /api/* ; todo lo demás lo
 * atienden los assets estáticos según la configuración de wrangler.jsonc
 * (not_found_handling: single-page-application).
 *
 * Andamiaje de la Fase 1: solo /api/health. Las rutas reales (auth, cuentas,
 * categorías, transacciones, presupuestos, ajustes y agregados) llegan en la
 * Fase 2, junto con el binding de D1 y Better Auth.
 */
const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    servicio: "walletapp",
    fase: 1,
    // Confirma que esto se ejecuta en workerd de verdad y no en un mock de Node.
    runtime: navigator.userAgent,
  }),
);

app.all("/api/*", (c) => c.json({ error: "Ruta no encontrada" }, 404));

export default app;
