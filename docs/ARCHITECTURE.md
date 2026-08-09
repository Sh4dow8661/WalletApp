# Arquitectura de la migración a PWA — Fase 0

Documento de reconocimiento y plan. Escrito antes de mover un solo archivo.
Rama de trabajo: `claude/app-progressive-web-app-2zwq2z` (creada desde `main`).

---

## 1. Estado verificado del entorno

Todo lo de esta tabla está comprobado ejecutando el comando, no supuesto.

| Herramienta          | Resultado                                                                                                                        | Nota                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                 | **v26.7.0**                                                                                                                      | Cumple el requisito de Node 20+. Versión muy reciente; vigilar incompatibilidades con Vite/Vitest.                                                       |
| npm                  | 11.19.0                                                                                                                          | Disponible                                                                                                                                               |
| pnpm                 | **no instalado**                                                                                                                 | Los criterios de aceptación de §14 hablan de `pnpm dev/test/build`. Propongo instalarlo (`npm i -g pnpm`) en la Fase 1.                                  |
| wrangler             | 4.120.0 (vía `npx`)                                                                                                              | Sin autenticar todavía                                                                                                                                   |
| git                  | 2.55.0.windows.3                                                                                                                 |                                                                                                                                                          |
| JDK                  | `C:\Users\imano\.jdks\jbr-17.0.14` (17.0.14) y JBR 21 de Android Studio                                                          | AGP 8.5.2 requiere JDK 17: se usa el primero                                                                                                             |
| Android SDK          | `C:\Users\imano\AppData\Local\Android\Sdk`                                                                                       | build-tools, platforms, ndk, emulator presentes                                                                                                          |
| Android Studio       | `C:\Program Files\Android`                                                                                                       |                                                                                                                                                          |
| Gradle wrapper       | 8.7 · AGP 8.5.2 · Kotlin 2.0.20                                                                                                  |                                                                                                                                                          |
| adb                  | Presente, **sin dispositivos conectados**                                                                                        | Relevante para la Fase 7                                                                                                                                 |
| Zona horaria del PC  | **UTC−04:00 — "Georgetown, La Paz, Manaus, San Juan"** → IANA `America/La_Paz`                                                   | Ver duda D3                                                                                                                                              |
| **Build de Android** | **`./gradlew :app:testDebugUnitTest` → BUILD SUCCESSFUL en 6m 2s**, 30 tareas, los 28 tests en verde                             | Solo avisos de `Icons.Filled.ArrowBack`/`TrendingUp` deprecados. **El entorno Android compila**, así que la ruta "Exportar todo (JSON)" de §12 es viable |
| Cloudflare           | `wrangler whoami` → autenticado por OAuth como `imanolhidalgo08@gmail.com`, cuenta `2b01dff5d63dd90ebe52d18cc3914ea7` (la de §5) | `wrangler d1 list` responde `[]`: acceso a D1 correcto y **no hay ninguna base creada todavía**                                                          |

Los 6 minutos del build son un dato en sí mismo: es un build limpio, pero corriendo sobre `G:\`.
Ver riesgo R1.

### Repo

|                                              |                                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Ruta local                                   | **`C:\dev\WalletApp`** (movido en la Fase 1; el original en `G:\My Drive\Personal\[04] Claude\Proyectos\WalletApp\WalletApp` queda de respaldo) |
| Remoto                                       | `https://github.com/Sh4dow8661/WalletApp.git` — **público**. `WalletApp_Claude` es un nombre antiguo que GitHub redirige aquí (ver D4)          |
| Ramas remotas                                | `main`, `claude/festive-wozniak-eZpTm`, `__tmp_probe__`                                                                                         |
| Rama `claude/app-progressive-web-app-2zwq2z` | **No existía**; creada en local desde `main`                                                                                                    |
| Estado                                       | Limpio, 12 commits, último `f5c63d8`                                                                                                            |
| Secretos                                     | `keystore.properties` y `local.properties` **no versionados** (correcto)                                                                        |

---

## 2. Lectura del código: §8 verificado archivo por archivo

### 8.1 Balance — confirmado, sin sorpresas

`TransactionDao.observeAccountBalanceDelta` (`TransactionDao.kt:47-52`) hace exactamente lo descrito:
suman `INCOME` y `TRANSFER AND isOutgoing=0`; restan `EXPENSE` y `TRANSFER AND isOutgoing=1`.
`AccountRepositoryImpl:33` compone `initialBalance + delta`.
`DashboardViewModel:63` filtra por `includeInTotal` para el balance total. Mapea 1:1 a SQL en D1.

### 8.2 Transferencias — bug confirmado, y es más amplio de lo descrito

`AddEditTransactionViewModel.save()` (`AddEditTransactionViewModel.kt:143-167`):

```kotlin
transactionRepository.upsert(sourceTx, budgetIds = emptyList())   // siempre
...
if (s.id == 0L) transactionRepository.upsert(destTx, ...)          // SOLO al crear
```

Al editar, la fila entrante nunca se toca. Además de lo que dice el prompt, encontré dos
agravantes que la PWA también tiene que cubrir:

1. **Borrar** (`delete()`, línea 187) elimina solo la fila cargada; la otra pata queda huérfana
   e infla el balance de la cuenta contraria para siempre.
2. **Cambiar el tipo** de una transacción existente (de `TRANSFER` a `EXPENSE`, o al revés)
   deja una pata suelta: no hay ningún código que limpie la fila hermana.

No hay forma de reparar esto en los datos viejos automáticamente sin ambigüedad, porque las dos
patas no comparten ningún identificador. El emparejado del importador (§12: misma fecha, mismo
importe, cuentas cruzadas) es la única heurística disponible, y **no reconciliará las
transferencias que ya quedaron descuadradas por este bug** — las patas tendrán importes o fechas
distintos y no casarán. Lo trato como riesgo abierto en la Fase 7.

### 8.3 Editar balance actual — confirmado

`AddEditAccountViewModel:51` guarda `transactionsDelta = currentBalance − initialBalance` al cargar,
y en `save()` (línea 96) persiste `initialBalance = tecleado − delta` solo si `isEditing`.
Al crear, el campo es el balance inicial tal cual. Portable literalmente.

### 8.4 Gasto de presupuesto — confirmado

`TransactionBudgetDao.observeSpentForBudgetInRange` (`TransactionBudgetDao.kt:26-41`):
`EXPENSE` suma, `INCOME` resta, filtrado por `date BETWEEN from AND to`.
Sin matching automático por categoría/cuenta (eliminado en `MIGRATION_4_5`).
Los derivados de la UI están en `Budget.kt:33-82` y coinciden con §8.4, con dos precisiones
que conviene fijar en los tests:

- `daysRemaining` = `floor((periodEnd − now)/día) + 1`, y **0** si `now > periodEnd`.
- `daysElapsed` = `(periodDurationDays − daysRemaining)` acotado a **mínimo 1** — no es
  "días transcurridos" literal; el día 1 del período da 1, no 0. Hay que portar ese `coerceAtLeast(1)`
  o `averageDailySpend` se dispara a infinito el primer día.

### 8.5 Períodos recurrentes — **hay un bug real en el original** (duda D2)

`WEEKLY`/`BIWEEKLY` son períodos rodantes limpios y se portan tal cual.
`MONTHLY` (`Budget.kt:138-172`) **no siempre devuelve un período que contenga a `now`**.

Lo verifiqué ejecutando un puerto exacto de `monthlyPeriod` en la JVM con `Calendar`
(script en el scratchpad de la sesión). Con ancla el **día 31** y `now` recorriendo enero–junio 2026:

```
ANCLA = 2026-01-31 00:00:00.000  (dia 31)

  HUECO now=2026-03-28 -> periodo [2026-02-28 .. 2026-03-27 23:59:59.999]
  HUECO now=2026-03-29 -> periodo [2026-02-28 .. 2026-03-27 23:59:59.999]
  HUECO now=2026-03-30 -> periodo [2026-02-28 .. 2026-03-27 23:59:59.999]
  HUECO now=2026-05-30 -> periodo [2026-04-30 .. 2026-05-29 23:59:59.999]

Dias en los que el periodo devuelto NO contiene a `now`: 4
```

Y los períodos consecutivos no son contiguos:

```
now=2026-03-01  -> [2026-02-28 .. 2026-03-27 23:59:59.999]
now=2026-04-01  -> [2026-03-31 .. 2026-04-29 23:59:59.999]   <- salta del 27 al 31 de marzo
```

**Causa:** el fin se calcula como `periodStart + 1 mes − 1 ms`. Cuando el inicio quedó recortado
(28-feb en vez de 31), el fin también se recorta, pero el inicio del período siguiente vuelve a
saltar al día 31. Los días intermedios (28, 29 y 30 de marzo) no pertenecen a ningún período.

**Impacto práctico:** un gasto hecho el 29 de marzo, enlazado a un presupuesto mensual anclado
el 31, no se cuenta en ningún período — desaparece del cálculo, en marzo y para siempre.

Solo afecta a anclas de día 29, 30 o 31. Si ninguno de tus presupuestos usa esas fechas, el bug
nunca se ha manifestado en tus datos.

### 8.6 Zona horaria — el bug 2 es bastante peor de lo descrito

El punto 1 (date pickers) está bien identificado: `DateUtils.pickerMillisToLocalStartOfDay`
(`DateUtils.kt:47`) hace la traducción correcta y en web se resuelve leyendo `<input type="date">`
como medianoche **local** con `date-fns`.

El punto 2 no es solo "la madrugada". Son **dos** desplazamientos encadenados:

1. `TransactionDao.observeDailyExpenseInRange` (`TransactionDao.kt:91`) agrupa con
   `(date / 86400000) * 86400000` → medianoche **UTC**.
2. `CalendarViewModel:60-61` toma ese valor y lo lee con un `Calendar` **local** para sacar
   `DAY_OF_MONTH`. Una medianoche UTC leída en UTC−4 es las 20:00 del día anterior.

Resultado en tu huso (UTC−4): **todo gasto registrado entre las 00:00 y las 20:00 hora local
aparece en el calendario un día antes**. No es un caso borde, es la mayoría de las transacciones.

La corrección de §8.6 (agrupar por fecha local con `format(date,'yyyy-MM-dd')` en la zona del
usuario) resuelve los dos desplazamientos de golpe. Lo mismo aplica a
`observeExpenseByCategoryInRange` y a los rangos de mes de estadísticas, que usan
`DateUtils.monthRange` — ese sí ya trabaja en local y es correcto.

### 8.7 Otros — verificados

- **Monedas:** las 20 de `CurrencyFormatter.kt:23-26`, en el orden del prompt. ✓
- **Signo:** `formatSigned` antepone `-`/`+` al valor absoluto. ✓ (usa `-` ASCII, no `−`)
- **Iconos:** los 17 de `IconMapper.options` (`CategoryIcon.kt:34-39`). ✓
- **Export CSV:** cabecera y formato exactos en `CsvExporter.kt:26-35`; nota con `,` y `\n`
  reemplazados por espacio. ✓ Ojo: **el importe se escribe con `toString()` de Kotlin**, así que
  un `1000.0` sale como `1000.0` y un valor con muchos decimales puede salir en notación
  científica. El importador de la PWA tiene que aceptar eso.
- **Cascadas:** `TransactionEntity` declara `CASCADE` en `accountId` y `SET NULL` en `categoryId`
  y `transferAccountId`. ✓
- **Estadísticas:** pie del mes navegable + tendencia de 6 meses (`StatisticsViewModel:90-107`). ✓
- **Semilla:** las 3 cuentas y 14 categorías de `DefaultData.kt` coinciden exactamente con §1. ✓
- **Paleta:** `Color.kt` coincide exactamente con §1. ✓

### Lógica de recibos a portar (§3.3)

`ReceiptParser.kt` (235 líneas), `ReceiptCategorizer.kt` (168) y `ParsedReceipt.kt` (49) son
Kotlin puro salvo dos dependencias de JVM que hay que sustituir en TS:

- `java.text.Normalizer` con `Form.NFD` + `\p{Mn}` → `str.normalize('NFD').replace(/\p{M}/gu,'')`.
- `java.util.Calendar` en `buildDate` → `date-fns` en la zona del usuario.

`ReceiptCategorizer.suggestBudgets` llama a `BudgetPeriod.currentPeriod`, así que
`budget-period.ts` es prerrequisito suyo. Tests a portar: **13 en `ReceiptParserTest`** y
**15 en `ReceiptCategorizerTest`**, 28 en total.

### Inventario de rutas (para el criterio "las 9 pantallas")

`Screen.kt` declara 13 rutas. Sin `scan-receipt` (fuera de alcance por §3.3) quedan **12**:

- 8 de navegación: `dashboard`, `transactions`, `budgets`, `statistics`, `calendar`,
  `settings`, `accounts`, `categories`.
- 4 de alta/edición: `transaction/edit`, `budget/edit`, `account/edit`, `category/edit`.

Más las 3 de auth (`/login`, `/registro`, `/recuperar`) que añade la PWA. Interpreto el
"9 pantallas" de §14 como las 8 de navegación + el conjunto de formularios; el objetivo real es
paridad funcional con las 12.

---

## 3. Riesgos identificados

### R1 — El repo vive en Google Drive (**bloqueante, ver duda D1**)

`G:\My Drive\...` es una unidad sincronizada. Un proyecto Node en Drive tiene tres problemas serios:

- **`node_modules`**: decenas de miles de archivos pequeños. Drive intentará sincronizarlos todos.
  Instalaciones lentísimas y consumo de cuota de la cuenta.
- **`.wrangler/state`**: D1 local es un **SQLite** abierto por `workerd`. Que Drive lo sincronice
  mientras está abierto puede corromper la base de desarrollo.
- **File watching**: el HMR de Vite sobre una unidad de red virtual es lento y poco fiable.

Ya hay precedente registrado de que `G:\` va con lag para servir archivos. Mi recomendación es
mover el repo de trabajo a `C:\dev\WalletApp` (clonando desde GitHub o desde la copia actual, que
está limpia y con todo pusheado). El APK y la copia en Drive se pueden conservar como respaldo.

### R2 — Node 26 es muy nuevo

Vite 7, Vitest 3 y `@cloudflare/vite-plugin` declaran soporte hasta Node 22/24. Node 26 debería
funcionar, pero si aparece algún fallo raro de dependencias en la Fase 1, la salida es instalar
Node 22 LTS en paralelo con `nvm-windows` o `fnm`. Lo aviso ahora para que no sorprenda.

### R3 — Los datos actuales no están accesibles todavía

No hay ningún `wallet_export_*.csv` en el PC ni dispositivo Android conectado por adb. Como el
entorno Android sí compila, la ruta buena de §12 (añadir "Exportar todo (JSON)" a la app Android,
compilar el APK e importarlo) está disponible — pero la Fase 7 necesitará que conectes el teléfono
o que me pases el archivo. Es un bloqueo de la Fase 7, no de las anteriores.

### R4 — El emparejado de transferencias del importador no puede arreglar el pasado

Explicado en §8.2. Las transferencias que el bug ya descuadró no casarán por (fecha, importe,
cuentas) y entrarán como dos filas sueltas sin `transfer_group_id`. Habrá que revisarlas a mano.
El importador debe **reportar explícitamente** cuántas patas quedaron sin pareja, no callárselo.

### R5 — `deleted_at` + `ON DELETE CASCADE` conviven mal

El esquema de §7 pide borrado lógico con `deleted_at` **y** claves foráneas con `CASCADE`/`SET NULL`.
Son dos mecanismos distintos: si el borrado real nunca ocurre, las cascadas nunca se disparan y el
aviso de UI de §8.7 ("borrar una cuenta arrastra sus transacciones") sería mentira.
Mi propuesta: `deleted_at` es la vía normal (toda query filtra `deleted_at IS NULL`) y la cascada se
aplica **en la capa de aplicación** dentro del mismo batch de D1, marcando también los hijos.
Las FK con `CASCADE` quedan como red de seguridad para un borrado físico futuro. Lo documento en
la Fase 2; no cambia el DDL de §7.

---

## 4. Plan concreto

Sin cambios respecto a §13 salvo lo que anoto. Cada fase cierra con commit y resumen, y espero
tu visto bueno.

**Fase 1 — Reestructurar.** `git mv` de `app/`, `gradle/`, `gradlew*`, `build.gradle.kts`,
`settings.gradle.kts`, `gradle.properties` a `legacy-android/`. `local.properties` y
`keystore.properties` no están versionados: los muevo a mano y ajusto la ruta del SDK.
Verifico que `legacy-android/` sigue compilando. Andamiaje Vite + React 19 + TS + Tailwind v4 +
`@cloudflare/vite-plugin`, ESLint, Prettier, Vitest. `pnpm dev` levantando.

**Fase 2 — Datos y backend.** D1 `walletapp-db`, migraciones de §7 con `wrangler d1 migrations`,
Drizzle, Better Auth, CRUD Hono, endpoints de agregados, tests de integración contra D1 local.
Aquí abro el PR en borrador. Necesitaré `npx wrangler login` — te avisaré cuando toque.

**Fase 3 — Dominio portado.** `budget-period.ts`, `balance.ts`, `dates.ts`, `money.ts`, `csv.ts`,
`receipt/`. Los 28 tests de recibos portados a Vitest, más los casos de §8.5 (incluidos los cuatro
huecos que documenté arriba) y el test de transferencia editada de §8.2. Cierra en verde.

**Fase 4 — UI móvil.** Las 12 rutas, paridad funcional, tema claro/oscuro/sistema.

**Fase 5 — UI escritorio.** Sidebar, master-detail, atajos, `ResponsiveDialog`, screenshots
de Playwright en 360/390/768/1280/1920.

**Fase 6 — PWA.** Manifest, iconos, screenshots, SW, caché persistida, outbox, aviso de versión,
Lighthouse.

**Fase 7 — Migración de datos.** Con el entorno Android confirmado, añado "Exportar todo (JSON)"
a la app Android, te compilo el APK y la PWA lo importa. Necesitaré el teléfono conectado.

**Fase 8 — Deploy.** `wrangler deploy`, build automático desde GitHub, README y `docs/DEPLOY.md`.

---

## 5. Decisiones tomadas al cerrar la Fase 0

### D1 — Ubicación del repo → **movido a `C:\dev\WalletApp`** ✅

Decidido sacar el repo de Google Drive por los motivos de R1. La copia en Drive y el APK se
conservan como respaldo; el historial y las ramas viajaron intactos.

Ejecutado en la Fase 1. La diferencia medida:

| Operación                                    | En `G:\` (Drive) | En `C:\`    |
| -------------------------------------------- | ---------------- | ----------- |
| `gradlew :app:testDebugUnitTest` (limpio)    | 6 min 02 s       | —           |
| `gradlew :app:testDebugUnitTest` (con caché) | 1 min 58 s       | **27 s**    |
| `git commit` de un solo archivo              | > 2 min          | instantáneo |
| `pnpm add` de 11 paquetes                    | —                | 8 s         |

### D2 — Bug mensual de §8.5 → **corregirlo**

En lugar de `periodEnd = periodStart + 1 mes − 1 ms`, el período se cierra **el instante anterior
al inicio del período siguiente**, calculado con la misma regla de ancla recortada. Así los
períodos quedan contiguos y todo día pertenece exactamente a uno.
Los tests de §8.5 incluirán los cuatro huecos documentados arriba como casos de regresión, y
`docs/MIGRATION.md` anotará que los presupuestos mensuales con ancla 29/30/31 pueden mostrar en la
PWA un gasto ligeramente mayor que en Android — porque la PWA cuenta días que Android se comía.

### D3 — Zona horaria por defecto → **`America/Puerto_Rico`**

UTC−4 sin horario de verano, coincide con el huso del PC. Sustituye a `America/Mexico_City` en el
`DEFAULT` de `user_settings.time_zone` (§7) y en los tests del criterio de §14. Sigue siendo
seleccionable desde Ajustes.

### D4 — Remoto → **`github.com/Sh4dow8661/WalletApp`** (la URL del prompt era la buena)

El remoto configurado en local apuntaba a `WalletApp_Claude`, y en la Fase 0 di por hecho que ese
era el bueno. Al hacer el primer push se vio que **GitHub redirige `WalletApp_Claude` a
`WalletApp`**: es el nombre antiguo del mismo repositorio. El canónico es
`Sh4dow8661/WalletApp`, exactamente el que decía §1 del prompt. El remoto local ya está
reapuntado ahí.

**El repositorio es público.** No hay ningún secreto versionado (`.dev.vars`,
`keystore.properties` y `local.properties` están fuera, y se comprueba antes de cada commit), y el
`database_id` de D1 no es sensible (§16). Aun así, conviene saberlo antes del despliegue: cualquiera
puede leer el código y el historial.

### D5 — Gestor de paquetes → **pnpm**

Instalado con `npm i -g pnpm` (v11.20.0) para que los comandos de §14 (`pnpm dev`, `pnpm test`,
`pnpm build`) funcionen literalmente.

---

## 6. Fase 1 — versiones instaladas y desviaciones

### Versiones

| Paquete                         | Versión          | Nota                                              |
| ------------------------------- | ---------------- | ------------------------------------------------- |
| react / react-dom               | 19.2.8           | Como pide §4                                      |
| react-router                    | **7.18.2**       | Ver desviación 1                                  |
| typescript                      | **6.0.3**        | Ver desviación 2                                  |
| vite                            | 8.2.1            |                                                   |
| @cloudflare/vite-plugin         | 1.51.1           |                                                   |
| wrangler                        | 4.120.0          |                                                   |
| tailwindcss / @tailwindcss/vite | 4.3.3            | Tailwind v4, configuración CSS-first con `@theme` |
| hono                            | 4.13.1           |                                                   |
| drizzle-orm / drizzle-kit       | 0.45.2 / 0.31.10 |                                                   |
| better-auth                     | 1.6.26           |                                                   |
| @tanstack/react-query           | 5.101.4          |                                                   |
| recharts                        | 3.10.1           |                                                   |
| lucide-react                    | 1.30.0           |                                                   |
| date-fns / date-fns-tz          | 4.4.0 / 3.2.0    |                                                   |
| vitest                          | 4.1.10           |                                                   |
| vite-plugin-pwa                 | 1.3.0            | Instalado, sin activar hasta la Fase 6            |
| eslint / prettier               | 10.8.1 / 3.9.6   |                                                   |

### Desviación 1 — React Router 7, no 8

pnpm resolvía `react-router@8.3.0`. §4 fija la **v7 en modo declarativo**, así que lo bajé a
`7.18.2`. No cambio el stack sin consultarte (§0). Si quieres la v8, dilo y lo actualizo antes de
que haya rutas escritas; después será más caro.

### Desviación 2 — TypeScript 6, no 7

pnpm instalaba `typescript@7.0.2` y **`typescript-eslint` no lo soporta**: `pnpm lint` moría con
`typescript-eslint does not support TS 7.0`. TS 7 además eliminó `baseUrl`, que rompía los
tsconfig. Bajé a `typescript@6.0.3`, que es lo último que soporta typescript-eslint. Los `paths`
se resuelven relativos al propio tsconfig, así que `baseUrl` no hace falta en ninguna de las dos.

### Otras cosas que hubo que resolver

- **`compatibility_date`**: puse la fecha de hoy (2026-08-09) y `vite dev` no arrancaba con
  `ERR_RUNTIME_FAILURE`: el binario de workerd de esta versión de wrangler solo llega a
  **2026-08-08**. Fijada ahí, con un comentario en `wrangler.jsonc` para que se pueda subir al
  actualizar wrangler.
- **Vitest y el plugin de Cloudflare no conviven en el mismo archivo de config.** Vitest inyecta
  `resolve.external` con los builtins de Node en todos los entornos y el plugin lo rechaza en el
  entorno del Worker. Por eso hay un `vitest.config.ts` aparte, sin el plugin. Los tests de
  integración de la API contra D1 local irán con `@cloudflare/vitest-pool-workers` en la Fase 2.
- **pnpm 11 ya no lee el campo `pnpm` de `package.json`.** Los permisos de scripts de instalación
  van en `pnpm-workspace.yaml` (`allowBuilds`). Sin aprobar `workerd`, no hay runtime local.

### Qué se verificó de verdad al cerrar la Fase 1

- `pnpm test` → 9 tests en verde (constantes portadas de la app Android).
- `pnpm typecheck` → limpio, en los tres proyectos de TS (app, worker, node).
- `pnpm lint` → limpio.
- `pnpm build` → construye el Worker (55 kB) y el cliente (194 kB, 61 kB gzip).
- `pnpm dev` → Vite en `localhost:5173` con el Worker en workerd real.
  - `GET /api/health` → `{"ok":true,...,"runtime":"Cloudflare-Workers"}`, o sea workerd de verdad,
    no un mock de Node.
  - `GET /api/loquesea` → 404.
  - `GET /transacciones` (ruta que no existe aún) → 200 con `index.html`: el fallback de SPA
    funciona, que es lo que necesitará React Router.
  - En el navegador: React monta, hace el fetch y pinta el resultado; **cero errores de consola**;
    los tokens de Tailwind resuelven a los colores exactos de `Color.kt`
    (`--color-primary` → `rgb(14,159,110)` = `#0E9F6E`, fondo `rgb(250,250,250)` = `#FAFAFA`);
    sin scroll horizontal.

---

## 7. Fase 2 — datos y backend

### Lo que quedó montado

- **D1 `walletapp-db`** creada (`824a3d16-…`, región ENAM), con el esquema de §7 aplicado por
  migraciones (`migrations/0001_esquema_inicial.sql`) tanto en local como en remoto.
- **Better Auth** con email + contraseña, sesiones en D1, cookies HttpOnly/Secure/SameSite=Lax,
  rate limiting y `ALLOW_SIGNUP` para cerrar el registro. Las tablas de auth las generó su CLI
  (`pnpm exec better-auth generate`), como pide §7.
- **Siembra automática al registrarse**: las 3 cuentas y 14 categorías de `DefaultData.kt` más la
  fila de ajustes, en un único batch atómico.
- **CRUD completo** en Hono para cuentas, categorías, transacciones, presupuestos y ajustes, más
  los agregados (`/api/stats/dashboard`, `/by-category`, `/trend`, `/daily`).
- **171 tests en verde**, de los cuales 60 son de integración corriendo en **workerd real contra
  D1 real** con las migraciones de producción aplicadas. Sin mocks de base de datos.

### Decisiones de implementación

**Borrado lógico y cascadas (riesgo R5, resuelto).** `deleted_at` es la vía normal y las cascadas
se aplican en la capa de aplicación dentro del mismo batch:

- Borrar una **cuenta** marca también sus transacciones, incluidas aquellas en las que era la
  cuenta _destino_ de una transferencia. Sin eso, la pata contraria seguiría sumando a un balance.
- Borrar una **categoría** deja las transacciones vivas y sin categoría (`SET NULL`), no las borra.
- Borrar un **presupuesto** sí elimina físicamente sus filas de enlace: son una tabla de unión sin
  valor histórico.

**El `spent` y el período se calculan en el servidor.** La regla de anclaje mensual con recorte de
día no se expresa razonablemente en SQL, así que `currentPeriod` corre en JS y el reparto de los
enlaces se hace en memoria. Devolver los derivados ya calculados evita que cliente y servidor
puedan discrepar en los números.

**Los agregados por día y por mes se agrupan en JS, no en SQL.** SQLite no conoce zonas horarias:
agrupar en SQL obligaría a usar días UTC, que es exactamente el bug de §8.6. El servidor lee
`user_settings.time_zone` en cada petición y agrupa con `dayKey`.

### Dos bugs propios que los tests cazaron

**1. `addMonths` devolvía el mes equivocado.** La primera versión usaba `addMonths` de date-fns
sobre un `Date` construido con `Date.UTC`. date-fns opera en la hora local del proceso, así que en
cualquier zona al oeste de Greenwich el resultado se iba un mes. Lo detectó el barrido exhaustivo
de períodos (730 días × 6 anclas). Ahora es aritmética pura sobre el contador de meses.

**2. Una subconsulta correlacionada devolvía 0 en silencio.** Interpolar `${walletAccounts.id}`
dentro de un `sql` que ya tiene su propio `FROM` hacía que Drizzle lo renderizara como `"id"`, sin
calificar la tabla:

```sql
FROM transactions t WHERE t.account_id = "id"   -- ¡compara con transactions.id!
```

En SQLite eso no es un error — `transactions` también tiene una columna `id` — así que la
comparación nunca casaba y el balance salía **0 sin avisar**. El síntoma era que "editar el balance
actual" (§8.3) no cuadraba la cuenta. Ahora la referencia se construye con `sql.identifier` y el
nombre real de la tabla.

Merece la pena subrayarlo: los dos fallos eran silenciosos y daban números plausibles. Ninguno
habría salido a la luz sin tests que comprobaran valores concretos.

### Pendiente para la Fase 8

- `wrangler secret put BETTER_AUTH_SECRET` en producción: requiere que el Worker ya esté
  desplegado. En local va por `.dev.vars` (no versionado; hay un `.dev.vars.example`).
- El bundle del Worker está en **273 kB gzip**, bastante por debajo del límite de 3 MB del plan
  gratuito, pero conviene vigilarlo al añadir dependencias.

---

## 8. Fase 3 — dominio portado y probado

`src/lib/` queda completo: `id`, `dates`, `balance` y `budget-period` ya entraron en la Fase 2
porque el backend los necesitaba; en esta se añaden `money`, `csv` y `receipt/`.

**256 tests en verde** (13 archivos), de los cuales 196 son de dominio y 60 de integración.

### Recibos (§3.3)

`ReceiptParser`, `ReceiptCategorizer` y `ParsedReceipt` portados a
`src/lib/receipt/`, con los **28 tests de Kotlin traducidos caso por caso** y varios añadidos donde
el port podía divergir. Nada de esto está enchufado todavía: el OCR queda para una v2, tal como
manda §3.3.

Tres detalles del port que merecen mención:

- `java.text.Normalizer` con `Form.NFD` + `\p{Mn}` se traduce a
  `normalize("NFD").replace(/\p{Mn}+/gu, "")`.
- El original usa la zona horaria del dispositivo para construir la fecha del ticket. En el Worker
  no existe tal cosa, así que **la zona entra por parámetro**. Es la única diferencia deliberada de
  comportamiento.
- El original acepta una fecha imposible (31 de febrero) y la deja recortar por `Calendar`. Aquí se
  rechaza y se devuelve `null`, que es lo que el llamador ya sabe tratar (usa la fecha actual):
  inventarse el 28 sería peor que admitir que no se pudo leer.

### El CSV no puede reconstruir la dirección de las transferencias

Al escribir el importador salió una pérdida de información que §12 no menciona y que conviene tener
clara **antes** de usar el CSV como vía de migración.

El CSV exporta las dos patas de una transferencia como dos filas: una con
`Account=A, TransferAccount=B` y otra con `Account=B, TransferAccount=A`. Pero **no exporta
`isOutgoing`**. Al reimportar, ante ese par no hay forma de saber cuál era la saliente — y no da
igual: elegir mal invierte la dirección del dinero y deja los dos saldos intercambiados.

`pairTransfers` empareja por fecha, importe y cuentas cruzadas, y adopta una convención
determinista: **la fila que aparece antes en el archivo se toma como saliente**. Es una suposición,
no un dato. El importador tendrá que decir cuántas transferencias reconstruyó para que se revisen.

Además, las transferencias que el bug de §8.2 ya descuadró **no casarán** (sus importes o fechas
difieren) y saldrán como huérfanas. `pairTransfers` las devuelve aparte precisamente para poder
avisar de ellas en vez de colarlas mal.

Todo esto es una razón de peso más para hacer la Fase 7 con el **export JSON completo** desde la app
Android, como recomienda §12, y no con el CSV.

### Diferencia menor en el formato del CSV

El exportador escribe los importes con dos decimales (`25.50`) en lugar del `toString()` de Kotlin
(`25.5`). Es dinero y se lee mejor en una hoja de cálculo. El importador acepta las dos formas, y
hay un test de ida y vuelta que lo comprueba.

---

## 9. Fase 4 — UI móvil

Las 12 rutas de §1 más las 3 de acceso, con paridad funcional y tema claro / oscuro / sistema.

### Estructura

- `src/app/lib/` — cliente HTTP tipado, cliente de Better Auth, mapeo de los 17 iconos a lucide,
  proveedor de tema.
- `src/app/hooks/` — TanStack Query (`api.ts`), `useBreakpoint`, `useMonth`.
- `src/app/components/ui/` — botón, tarjeta, campos, `ResponsiveDialog` (bottom sheet en móvil,
  diálogo en escritorio) y `ConfirmDialog`.
- `src/app/components/domain.tsx` — `CategoryIcon`, `MoneyText`, `MonthSelector`, `IconPicker`,
  `ProgressBar`.
- `src/app/routes/` — las pantallas.

### Decisiones

**Los formularios se montan con `key` en vez de sincronizarse con un efecto.** Cada pantalla de
alta/edición se parte en dos: una que carga los datos y otra que recibe los valores iniciales y los
mete en `useState`. Volcar los datos del servidor al estado desde un `useEffect` provoca renders en
cascada — y el linter de React lo marca como error. Con `key`, cambiar de registro remonta el
formulario limpio.

**Los controles son nativos** (`input`, `select`, `textarea`). En móvil abren el teclado y los
selectores del sistema, que se manejan mucho mejor que cualquier réplica en JavaScript. Todos
respetan el mínimo de 44 px de §10.

**Las pantallas de formulario ocultan la barra inferior** y ocupan la pantalla completa, como en la
app Android y como pide §10. Además del criterio de diseño, tiene un efecto práctico: con la barra
puesta, tapaba el botón de guardar.

**El tema se aplica primero desde `localStorage` y luego lo confirma el servidor.** Sin el paso por
`localStorage` habría un fogonazo blanco en cada carga mientras llega la respuesta del API; sin el
del servidor, el tema no se compartiría entre el móvil y el PC.

### Un bug propio, encontrado mirando la pantalla

En la leyenda de estadísticas aparecía una entrada fantasma: "Sin categoría" con el mismo importe
que "Comida", y los porcentajes sumaban más de 100.

La causa era la `key` de React. Estaba usando el **nombre** de la categoría, y en el primer render
—cuando la lista de categorías todavía no ha llegado— **todas** las entradas se llaman "Sin
categoría". Con claves repetidas React deja nodos huérfanos, que es exactamente lo que se veía. La
clave es ahora el `categoryId`.

Es un fallo que ningún test de dominio podía cazar: solo aparece con el temporizado real de dos
consultas que resuelven por separado.

### Qué se verificó en el navegador

Con un usuario real registrado desde la app y datos de prueba creados por el API, a 375×812:

- **Inicio**: balance total 5 654,50 = 1 014,50 + 4 640 + 0; ingresos del mes 1 800; gastos 195,50.
  Los tres saldos cuadran con las transacciones creadas, incluida la transferencia.
- **Presupuestos**: destaca el restante (175 = 250 − 75) y sugiere 14,58/día = 175/12, con la
  barra de progreso al 30 %.
- **Estadísticas**: Comida 69 % / Transporte 31 %, sumando los 195,50 del mes.
- **Calendario**: el gasto de hoy aparece en el día **9**, no en el 8 — la corrección de §8.6
  funcionando de verdad y no solo en los tests.
- **Ajustes**: las 20 monedas, los 3 temas y la zona horaria; export CSV.
- Sin scroll horizontal y sin errores de consola propios (solo los del WebSocket de HMR, que son
  del navegador embebido).
- Tema claro y oscuro, ambos comprobados con captura.

---

## 10. Fase 5 — UI de escritorio y adaptativa

La misma app en tres composiciones, con las mismas rutas y los mismos datos:

| Ancho       | Navegación                  | Formularios            | Acción principal     |
| ----------- | --------------------------- | ---------------------- | -------------------- |
| < 768 px    | Barra inferior, 5 secciones | Pantalla completa      | Botón flotante       |
| 768–1279 px | Rail vertical con iconos    | Pantalla completa      | Botón flotante       |
| ≥ 1280 px   | Barra lateral con etiquetas | Panel junto a la lista | Botón en la cabecera |

### Master-detail sin duplicar rutas

Las altas y ediciones pasan a ser **rutas hijas** de su lista
(`/transacciones/:id` en vez de `/transaccion/:id`). `MasterDetail` lee el
detalle con `useOutlet()`, que devuelve `null` cuando no hay ruta hija activa:
en escritorio lo pinta al lado de la lista y en móvil lo pone en su lugar. Un
único árbol de rutas, sin estado de "seleccionado" aparte ni navegación
duplicada por dispositivo.

### Atajos de teclado

`N` nueva transacción · `/` buscar · `←`/`→` cambiar de mes · `?` ayuda ·
`Esc` cerrar · `G` seguido de `D`/`T`/`P`/`E` para saltar de sección.

Solo se activan cuando el foco no está en un campo de texto —si no, escribir
"n" en una nota abriría el alta— y se ignoran con Ctrl, Alt o Meta pulsados,
para no pisar los del navegador. Hay un test que comprueba justamente eso:
escribir "nomina" en el buscador no debe abrir nada.

### Un bug que apareció al montar la cabecera

El selector de mes de §10 vive en la cabecera fija del escritorio, pero
`useMonth` tenía un `useState` **local a cada pantalla**. Con eso, mover el mes
en la cabecera no habría cambiado nada de lo que se ve debajo: cada pantalla
seguiría con su propio mes.

Ahora el mes es un contexto (`MonthProvider`), que es lo que exige tener un
control compartido en un sitio y su efecto en otro.

### Otro bug real, encontrado por los tests de Playwright

Los cinco tamaños fallaban con controles de la **pantalla de login** donde debía
haber contenido. La causa era el rate limiting: el techo general estaba en 30
peticiones por minuto y `/get-session` se consulta **en cada navegación**. Un
usuario moviéndose rápido por la app recibía 429, el cliente lo interpretaba
como "no hay sesión" y lo echaba al login.

Corregido: `/get-session` queda sin límite (es una lectura sin secretos) y el
techo general sube a 200/min. Lo que sí sigue apretado es lo que importa —
login 5/min, registro y recuperación 3 cada 5 min.

Es un fallo que solo se manifiesta navegando de verdad por la app; ninguna
prueba de una sola pantalla lo habría visto.

### Verificación con Playwright

`pnpm test:e2e` levanta el `pnpm dev` real (Vite + workerd + D1 local) y recorre
**9 rutas en 5 tamaños**, 45 combinaciones. En cada una comprueba que:

- no hay scroll horizontal;
- ningún control queda fuera del viewport;
- ningún control baja del objetivo táctil: **44 px en móvil**, como pide §10 (en
  escritorio el ratón es preciso y basta con que sea clicable).

Y guarda una captura de cada combinación en `tests/e2e/capturas/`.

Ese umbral de 44 px encontró dos controles reales por debajo: los enlaces "Ver
todo" del dashboard y los chips de filtro de transacciones.

Hay además cuatro tests de comportamiento: que el layout cambie con el ancho,
que en escritorio se vean lista y detalle a la vez, que los atajos funcionen y
que escribir en un campo no los dispare.

**Nota sobre la sesión en los tests**: el login se hace una sola vez en un
proyecto de `setup` y se reutiliza la cookie. Hacer login en cada test chocaría
con el rate limit de §11 — que es una medida que queremos activa, así que los
tests se adaptan a ella en vez de desactivarla.

---

## 11. Fase 6 — PWA

### Lo que quedó montado

- **Manifest** con todo lo de §9: nombre, `display_override`, colores, `lang`,
  `dir`, `orientation`, iconos de 192 y 512 más uno _maskable_, capturas
  `narrow` y `wide`, y los tres accesos directos.
- **Iconos** generados desde el trazado original de `ic_launcher_foreground.xml`
  con `scripts/generar-iconos.mjs`. El _maskable_ lleva más margen porque el
  lanzador solo garantiza el 80% central; sin ese margen, un icono circular
  cortaría la cartera.
- **Service worker** (Workbox): precache del shell, `NetworkFirst` para `/api/*`,
  `CacheFirst` para iconos y capturas, y **`NetworkOnly` para `/api/auth/*`** —
  servir una respuesta vieja de sesión podría dejar entrar con una sesión ya
  cerrada.
- **Aviso de versión nueva** en vez de recarga silenciosa (`registerType: "prompt"`).
- **Caché persistida en IndexedDB** y **cola de escrituras offline**.

### La cola offline usa TanStack Query, no una implementación propia

Con `networkMode: "offlineFirst"`, una mutación sin red queda **pausada**, se
persiste junto a la caché y se reanuda al volver la conexión, incluso si la app
se cerró por medio. Para que sobreviva a una recarga, lo que se guarda son la
clave y las variables — la función no — así que las funciones están registradas
por clave en `src/app/hooks/mutaciones.ts`.

Las escrituras son **idempotentes**: el identificador lo genera el cliente
(`useIdNuevo`, UUID v7) y viaja en el cuerpo del POST, así que reenviar una
creación pendiente no crea un duplicado.

### Dos bugs que solo aparecen sin red

**1. El guard expulsaba al login al abrir sin conexión.** `useSession` no puede
preguntarle al servidor, devuelve "no hay sesión" y el guard mandaba a `/login`:
la app quedaba inservible offline, justo lo contrario de lo que pide §9. Peor
aún, de camino borraba la marca local de sesión.

La corrección distingue **"el servidor dice que no estás autenticado"** de **"no
he podido preguntárselo"**, mirando el `error` de la consulta y no solo
`navigator.onLine` (hay redes que responden pero no llegan). Si no se pudo
comprobar y consta que había sesión, se enseña la app con los datos guardados.
No abre ninguna puerta: el servidor sigue validando cada petición, así que sin
cookie válida no llegaría ningún dato.

**2. Las consultas restauradas no se mostraban.** Con el `networkMode: "online"`
por defecto, al abrir sin red las consultas quedan _pausadas_ y la pantalla se
queda con los valores por defecto aunque IndexedDB tenga los datos. También van
en `offlineFirst`.

### Verificación

`pnpm test:e2e:pwa` corre **7 tests contra el build servido** (no contra
`vite dev`, donde el service worker está desactivado a propósito para que el HMR
funcione). Comprueban el manifest campo a campo, que los iconos y capturas se
sirven de verdad, que el SW precachea, que **la app abre sin red mostrando los
datos guardados y el aviso correspondiente**, y que **una categoría creada sin
conexión llega al servidor al recuperarla**.

### Lo que no se pudo verificar

**Lighthouse no arranca en esta máquina**: falla con `EPERM` al limpiar su
carpeta temporal de perfil, antes de emitir el informe. Se probó con el Chrome
del sistema y con perfil explícito, con el mismo resultado; es una restricción
del entorno, no del proyecto.

Los criterios _funcionales_ de §9 sí están verificados por los tests de arriba.
Lo que queda pendiente son los **números** (Performance ≥ 90, Accessibility ≥ 95).
Se pueden sacar en un clic desde Chrome → DevTools → Lighthouse contra
`pnpm preview`, y conviene hacerlo antes de dar por buena la Fase 8.

## 12. Fase 7 — migración de los datos reales

### El CSV no bastaba, y el motivo no era obvio

La app Android ya exportaba CSV, así que la vía "natural" era importar ese
archivo. Al leer `CsvExporter.kt` quedó claro que no sirve como método de
migración: el formato es

```
Date,Type,Amount,Category,Account,TransferAccount,Note
```

y ahí **no está `isOutgoing`**. Ante un par de filas `(A→B)` y `(B→A)` no hay
forma de saber cuál era la que salía, y elegir mal invierte la dirección del
dinero y deja los dos saldos intercambiados. Además se pierden presupuestos,
enlaces transacción↔presupuesto, balances iniciales, colores, iconos e
`includeInTotal`.

Por eso la Fase 7 empieza **en el lado Android**: se añadió un exportador JSON
que vuelca las cinco tablas enteras.

### Lo añadido a la app Android (`legacy-android/`)

- `data/local/dao/ExportDao.kt` — cinco lecturas completas, `suspend` y sin
  `Flow`: aquí no interesa observar cambios, sino leer cada tabla una vez.
- `util/JsonExporter.kt` — `FORMAT_VERSION = 1`. Emite `formato`, `version`,
  `exportadoEn`, `zonaHoraria`, `moneda`, `app` y las cinco secciones. Usa
  `org.json` (viene con Android): añadir una librería de serialización a una app
  que ya no se va a tocar más no compensa.
- Conectado en `WalletDatabase`, `DatabaseModule`, `SettingsViewModel.exportJson()`
  y una tarjeta nueva en `SettingsScreen`: **«Exportar todo (JSON)»**.
- `versionCode = 5`, `versionName = "1.9.2"`. APK de release firmada con el
  keystore de siempre (`CN=WalletApp, O=Sh4dow8661`), así que se instala encima
  de la que hay **sin borrar los datos**.

La zona horaria del dispositivo va en el archivo a propósito: las fechas son
epoch millis y, para interpretarlas sin correr el día, hay que saber en qué huso
se eligieron (§8.6).

### Lo añadido a la PWA

- `src/lib/import-json.ts` — validación y traducción. Los identificadores de Room
  son enteros por tabla; en D1 son UUID v7. Se construye un mapa por tabla y se
  traduce **toda** referencia, así que los enlaces sobreviven.
- `src/worker/routes/import-export.ts` — `POST /api/data/{json,csv}` para
  importar y `GET /api/data/{json,csv}` para exportar.
- `src/app/components/gestion-datos.tsx` — la UI en Ajustes, con confirmación
  antes de reemplazar y un resumen al terminar.

### Tres decisiones

**1. Importar reemplaza, no fusiona.** Sin una clave estable compartida entre
Room y D1, "añadir" duplicaría cuentas y categorías en cuanto se importara dos
veces el mismo archivo. Reemplazar es además lo que se necesita para migrar. La
UI lo dice con todas las letras antes de tocar nada.

**2. El borrado previo es físico, no lógico.** En el resto de la app el borrado
es lógico (`deleted_at`), pero aquí dejar las filas viejas marcadas solo serviría
para inflar la base y para que un export posterior arrastrara dos juegos de datos
distintos.

**3. El export de la PWA usa el mismo formato que el de Android.** Así el
importador sirve para migrar **y** para restaurar una copia de seguridad, y no
hay dos formatos que mantener.

### Nada del archivo se da por bueno

El archivo lo elige el usuario y puede venir de cualquier parte, así que cada
campo se comprueba: tipos, iconos y recurrencias contra sus listas de constantes,
los colores contra `#RRGGBB`, los identificadores contra enteros. Lo que no
encaja se sustituye por un valor válido en vez de acabar en la base y romper una
pantalla más tarde; lo que no se puede rescatar (una transacción cuya cuenta no
está en el archivo) se descarta y **se cuenta en el resumen**.

Las transferencias se reagrupan bajo un `transfer_group_id` nuevo emparejando
cada pata saliente con su entrante (mismo importe, misma fecha, cuentas
cruzadas). Las que quedan sueltas —herencia del bug de §8.2, que descuadraba las
patas al editar— **se importan igual**: el dinero se movió de verdad. El resumen
avisa de cuántas hay para poder repasarlas.

### Un bug de D1 que este trabajo destapó

Al probar la importación con 220 movimientos, la inserción falló con
`too many SQL variables`. **D1 solo admite 100 variables por sentencia**, y un
`INSERT` de varias filas gasta una por columna y por fila.

Buscando otros sitios con el mismo patrón apareció uno **mucho peor**, que no
tiene nada que ver con importar: `withBudgetIds()` en
`src/worker/routes/transactions.ts` pedía los enlaces con
`IN (id1, id2, …)` usando los identificadores de la página, y esa consulta
devuelve hasta 1000 filas. Es decir: **`GET /api/transactions` daba un 500 en
cuanto había más de 100 movimientos** — la pantalla principal de la app, con
cualquier historial real. No había saltado antes porque ningún test llegaba a
esa cantidad de filas.

Corregido en tres sitios, siempre igual: filtrar por `userId` con un `JOIN` en
vez de por una lista de identificadores, lo que gasta **una** variable en lugar
de N.

- `transactions.ts` → `withBudgetIds()`
- `budgets.ts` → `enrich()`
- `import-export.ts` → el export JSON

Y en `validation.ts`, `idArray()` ahora rechaza más de 50 elementos: esa lista
viene del cliente y también termina en un `IN (...)`.

Para que no vuelva a pasar, el troceado de los `INSERT` **deriva el tamaño del
lote del número de columnas de las propias filas** en vez de tenerlo escrito a
mano, de modo que añadir una columna mañana ajuste el lote solo.

### Verificación

- **33 tests nuevos** (289 en total): 16 unitarios de la traducción y 17 de
  integración contra la D1 real.
- El de ida y vuelta es el que importa: sembrar datos → exportar → importar →
  comprobar que cuentas, categorías, movimientos, saldos, presupuestos y **lo
  gastado en cada presupuesto** quedan exactamente igual. Solo cambian los
  identificadores y las marcas de tiempo, que el formato no lleva.
- Se comprueba también que una transferencia importada **sigue editándose como
  una sola cosa** (las dos patas a la vez), que un archivo inválido se rechaza
  **sin tocar los datos que ya había**, y que 220 movimientos entran de una vez.

## 13. Fase 8 — despliegue

### Lo que está en producción

**https://walletapp.imanolhidalgo08.workers.dev**

Un solo Worker (`walletapp`) sirve la SPA y la API, con la D1 `walletapp-db`
detrás. Todo dentro del plan gratuito.

Comprobado tras el despliegue: `/api/health` responde desde
`Cloudflare-Workers`, `/` y las rutas internas devuelven el shell (el
`not_found_handling: "single-page-application"` funciona), el manifest, el
service worker, los iconos y las capturas se sirven, y `/api/accounts` **sin
sesión devuelve 401**. El guard de §11 sigue en pie en producción, no solo en los
tests.

> En los primeros segundos tras el `deploy`, `/api/health` devolvió un
> `error code: 1042` y `/sw.js` un 404. Era propagación: al repetir, ambos
> correctos. Conviene no dar por rota una versión recién subida sin reintentar.

### El secreto

`BETTER_AUTH_SECRET` se generó con `crypto.randomBytes(48)` y se envió por
tubería directamente a `wrangler secret put`, sin pasar por la pantalla ni por
ningún archivo. Vive solo en Cloudflare. El de desarrollo es otro distinto, en
`.dev.vars`, que no se versiona.

### La CI verifica, no despliega

`.github/workflows/ci.yml` corre tipos, lint, formato, los 289 tests, el build y
los 17 e2e (con Chromium instalado en el runner).

**No despliega a propósito.** Hacerlo obligaría a guardar en los secretos del
repositorio un token de API de Cloudflare con escritura sobre Workers y D1, y esa
decisión es del dueño de la cuenta. El despliegue se hace con `pnpm deploy`, que
usa la sesión OAuth de `wrangler login` y no deja ningún token en disco del
repositorio. En `docs/DEPLOY.md` quedan escritos los tres pasos por si algún día
se quiere automatizar.

Los e2e necesitan la app levantada, así que el workflow escribe un `.dev.vars`
con un secreto aleatorio de usar y tirar: solo firma sesiones dentro de un
runtime que se destruye al acabar el job.

### Pendiente, y depende de ti

**`ALLOW_SIGNUP` sigue en `"true"`.** La URL es pública, así que ahora mismo
cualquiera que dé con ella puede registrarse. No vería datos ajenos —el servidor
filtra por la sesión en cada petición— pero no hay razón para dejarlo abierto.

No se puede cerrar antes porque **la cuenta la tiene que crear el usuario**: es
quien elige la contraseña. El orden es: registrarse → poner `"false"` en
`wrangler.jsonc` → `pnpm deploy`.

**Lighthouse sigue sin poder ejecutarse en esta máquina** (`EPERM` al limpiar su
perfil temporal). Ahora que hay una URL pública se puede medir desde PageSpeed
Insights, sin depender del Chrome local.
