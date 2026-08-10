import { fileURLToPath, URL } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
      // "prompt" y no "autoUpdate": §9 pide avisar de la nueva versión con un
      // toast en vez de recargar solo. Recargar sin avisar a mitad de un
      // formulario se lleva por delante lo que el usuario estaba escribiendo.
      registerType: "prompt",
      injectRegister: null, // el registro lo hace src/app/lib/pwa.ts

      manifest: {
        name: "WalletApp",
        short_name: "Wallet",
        description:
          "Control de finanzas personales: cuentas, transacciones, presupuestos y estadísticas.",
        lang: "es",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // window-controls-overlay aprovecha la barra de título en escritorio;
        // si el navegador no lo soporta, cae a standalone.
        display_override: ["window-controls-overlay", "standalone"],
        orientation: "any",
        theme_color: "#0E9F6E",
        background_color: "#FAFAFA",
        categories: ["finance", "productivity"],

        icons: [
          {
            src: "/iconos/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/iconos/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/iconos/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],

        // Sin capturas `wide`, Chrome de escritorio no enseña el diálogo de
        // instalación enriquecido (§9).
        screenshots: [
          {
            src: "/capturas/movil-inicio.png",
            sizes: "390x844",
            type: "image/png",
            form_factor: "narrow",
            label: "Balance, cuentas y últimos movimientos",
          },
          {
            src: "/capturas/movil-presupuestos.png",
            sizes: "390x844",
            type: "image/png",
            form_factor: "narrow",
            label: "Presupuestos con lo que queda por gastar",
          },
          {
            src: "/capturas/escritorio-inicio.png",
            sizes: "1280x800",
            type: "image/png",
            form_factor: "wide",
            label: "Panel de inicio en escritorio",
          },
          {
            src: "/capturas/escritorio-estadisticas.png",
            sizes: "1280x800",
            type: "image/png",
            form_factor: "wide",
            label: "Gasto por categoría y tendencia de 6 meses",
          },
        ],

        shortcuts: [
          {
            name: "Nueva transacción",
            short_name: "Nueva",
            url: "/transacciones/nueva",
            icons: [{ src: "/iconos/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Presupuestos",
            url: "/presupuestos",
            icons: [{ src: "/iconos/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Estadísticas",
            url: "/estadisticas",
            icons: [{ src: "/iconos/icon-192.png", sizes: "192x192" }],
          },
        ],
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2}"],
        // El shell tiene que servirse desde caché para cualquier ruta, que es lo
        // que hace que la app abra sin red. Se excluye /api para que las
        // peticiones no acaben devolviendo el HTML del shell.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          {
            // **Nunca** se cachea nada de sesión ni de autenticación (§9).
            // Servir una respuesta vieja de /api/auth podría dejar entrar con
            // una sesión ya cerrada, o mostrar los datos del usuario anterior.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/auth"),
            handler: "NetworkOnly",
          },
          {
            // El resto del API: red primero y, si no llega, lo último conocido.
            // El banner de "sin conexión" avisa de que lo que se ve puede estar
            // desactualizado.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "walletapp-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Iconos y capturas: no cambian sin cambiar de nombre.
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/iconos/") ||
              url.pathname.startsWith("/capturas/"),
            handler: "CacheFirst",
            options: {
              cacheName: "walletapp-estaticos",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },

      devOptions: {
        // El service worker desactivado en `vite dev`: con él puesto, el HMR
        // sirve archivos cacheados y los cambios no se ven. Se comprueba con
        // `pnpm build && pnpm preview`.
        enabled: false,
      },
    }),

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
// workerd; los de integración de la API usan @cloudflare/vitest-pool-workers.
