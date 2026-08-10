import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".wrangler/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      // Proyecto Android heredado: no se lintea con las reglas de la PWA.
      "legacy-android/**",
      // Lo genera `wrangler types`.
      "worker-configuration.d.ts",
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  // Frontend: navegador + reglas de React.
  {
    files: ["src/app/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Worker: entorno de Cloudflare, ni Node ni navegador.
  {
    files: ["src/worker/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        Env: "readonly",
      },
    },
  },

  // Dominio compartido: TypeScript puro, sin globals de plataforma.
  {
    files: ["src/lib/**/*.ts", "src/shared/**/*.ts"],
    rules: {
      // El dominio no debe depender de la zona horaria de la máquina:
      // las fechas se calculan siempre con una zona explícita (§8.6).
      "no-restricted-globals": ["error"],
    },
  },

  // Configuración, scripts de apoyo y tests: corren en Node.
  //
  // También llevan los globals del navegador porque el cuerpo de un
  // `page.evaluate` se ejecuta DENTRO de la página, aunque esté escrito en un
  // archivo de Node: sin esto, cada `document` o `window` de un test de
  // Playwright se marcaría como `no-undef`.
  {
    files: ["*.config.{ts,js}", "scripts/**/*.{mjs,js,ts}", "tests/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Prettier al final: apaga las reglas de formato que chocan con él.
  prettier,
);
