# 💰 WalletApp

<p align="center">
  <img src="https://img.shields.io/badge/PWA-Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/D1-SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" />
</p>

<p align="center">
  Finanzas personales en una <strong>aplicación web instalable</strong>: el mismo
  programa en el móvil y en el escritorio, con los datos en la nube y
  funcionando también sin conexión.
</p>

**→ https://walletapp.imanolhidalgo08.workers.dev**

---

## Qué hace

- **Ingresos, gastos y transferencias** entre cuentas
- **Cuentas** de efectivo, banco y tarjeta, cada una con su saldo, y la opción de
  dejar alguna fuera del total
- **Categorías** con icono y color, las 14 por defecto más las que hagan falta
- **Presupuestos** con recurrencia (una vez, semanal, quincenal o mensual) y
  enlace manual de los movimientos que cuentan en cada uno
- **Estadísticas**: gasto por categoría, tendencia de seis meses y calendario con
  mapa de calor del gasto diario
- **Importar y exportar** en JSON (todo) y CSV (los movimientos)
- Tema claro, oscuro o del sistema; moneda y zona horaria configurables

Y como PWA:

- **Se instala** desde el navegador, sin tiendas de aplicaciones
- **Abre sin conexión** con los últimos datos, y avisa de que lo son
- **Lo que escribas sin red se encola** y se envía solo al recuperarla, aunque
  hayas cerrado la app por medio
- **Se sincroniza entre dispositivos**: los datos están en la nube, no en el
  teléfono

---

## Stack

| Capa             | Tecnología                                                      |
| ---------------- | --------------------------------------------------------------- |
| Frontend         | React 19, TypeScript 6, Tailwind v4, React Router 7             |
| Datos en cliente | TanStack Query v5 (con caché persistida y cola offline)         |
| Backend          | Hono sobre Cloudflare Workers                                   |
| Base de datos    | Cloudflare D1 (SQLite) + Drizzle ORM                            |
| Autenticación    | Better Auth (correo y contraseña, cookie HttpOnly)              |
| Gráficas         | Recharts                                                        |
| Build            | Vite 8 + `@cloudflare/vite-plugin` (workerd real en desarrollo) |
| PWA              | vite-plugin-pwa (Workbox)                                       |
| Tests            | Vitest (unitarios y API en workerd) + Playwright (e2e y PWA)    |

Un **solo Worker** sirve la SPA y la API: `/api/*` va al código y todo lo demás a
los archivos estáticos, con vuelta a `index.html` para que enrute React Router.

---

## Estructura

```
src/
├── app/          # La SPA de React
│   ├── routes/       # Una pantalla por archivo
│   ├── components/   # ui/ (genéricos), domain/ (de negocio)
│   ├── layouts/      # Móvil (barra inferior) y escritorio (barra lateral)
│   ├── hooks/        # Acceso a datos con TanStack Query
│   └── lib/          # Cliente HTTP, tema, PWA, sesión
├── worker/       # La API
│   ├── routes/       # accounts, categories, transactions, budgets, stats,
│   │                 # settings, import-export
│   ├── db/           # Esquema de Drizzle, cliente, siembra, batch
│   ├── auth.ts       # Better Auth
│   ├── context.ts    # Guard de sesión: la frontera de seguridad
│   └── validation.ts
├── lib/          # Dominio puro, compartido y muy probado
│   ├── balance.ts, budget-period.ts, dates.ts, money.ts, csv.ts,
│   │              import-json.ts, id.ts (UUID v7)
│   └── receipt/      # Parser de recibos portado de Kotlin (aún sin usar)
└── shared/       # Constantes y tipos que ven las dos partes

migrations/       # Migraciones de D1
legacy-android/   # La app Android original (referencia, no se borra)
docs/             # ARCHITECTURE.md, MIGRATION.md, DEPLOY.md
```

---

## Desarrollo

Hace falta **Node 20+** y **pnpm 11+**.

```bash
pnpm install
cp .dev.vars.example .dev.vars     # y rellena BETTER_AUTH_SECRET
pnpm db:migrate:local
pnpm dev
```

`pnpm dev` levanta **workerd de verdad** con sus bindings y una D1 local, no un
simulacro: si una consulta está mal escrita, falla igual que fallaría en
producción.

| Comando                                        | Qué hace                                                 |
| ---------------------------------------------- | -------------------------------------------------------- |
| `pnpm dev`                                     | Desarrollo con recarga en caliente                       |
| `pnpm build`                                   | Comprueba tipos y compila                                |
| `pnpm preview`                                 | Sirve el build (necesario para probar el service worker) |
| `pnpm test`                                    | Unitarios + integración del API                          |
| `pnpm test:e2e`                                | Playwright: adaptación a cinco tamaños de pantalla       |
| `pnpm test:e2e:pwa`                            | Playwright: manifest, service worker y modo sin red      |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Comprobaciones                                           |
| `pnpm deploy`                                  | Compila y sube a Cloudflare                              |

**289 tests** unitarios y de integración, más 17 end-to-end.

---

## Documentación

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — el registro de la migración
  fase por fase: qué se decidió, por qué, y los fallos de la app original que se
  corrigieron por el camino.
- **[docs/MIGRATION.md](docs/MIGRATION.md)** — cómo pasar los datos de la app
  Android a la PWA, paso a paso.
- **[docs/DEPLOY.md](docs/DEPLOY.md)** — desplegar, migraciones, secretos y
  copias de seguridad.

---

## La app Android

`legacy-android/` guarda la aplicación original en Kotlin (Compose, Room, Hilt).
No se borra: es la referencia de las reglas de negocio y la vía por la que salen
los datos. La versión 1.9.2 añade **«Exportar todo (JSON)»** en Ajustes, que es
justo lo que hace posible la migración.

Cuatro cosas cambian respecto a ella, todas a mejor:

1. **Las transferencias no se descuadran.** Antes eran dos filas sin nada que las
   uniera, así que editar o borrar tocaba solo una. Ahora comparten un
   `transfer_group_id` y las dos se crean, editan y borran dentro de la misma
   transacción de D1.
2. **Los días son los tuyos.** Todo lo que se agrupa por día o por mes se calcula
   en tu zona horaria, no en UTC. Antes, al oeste de Greenwich, el calendario
   asignaba gastos al día siguiente.
3. **Los presupuestos mensuales no dejan huecos.** El fin de cada período se
   deriva del inicio del siguiente, así que ni se pierde un día ni se solapan.
4. **Es multidispositivo.** Los datos viven en D1 y cada petición comprueba la
   sesión en el servidor.

Lo que **no** viaja a esta versión es el escaneo de recibos: dependía de ML Kit,
que no existe en la web. El parser en sí sí está portado a TypeScript, con sus
tests, esperando a que haya un OCR que lo alimente.

---

## Licencia

MIT. Ver [LICENSE](LICENSE).
