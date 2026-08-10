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

---

## 12. Tarjetas de crédito y utilización

Añadido después de la migración. Hasta aquí una tarjeta se listaba y se sumaba
igual que una cuenta de efectivo, que es incorrecto: **una tarjeta no es dinero
que se tiene, es deuda**.

### Convención de signos — la que ya había, no una nueva

`balance.ts` hace que un `EXPENSE` reste del balance de su cuenta, así que
gastar con una tarjeta la deja en **negativo**. De ahí sale todo lo demás:

    deuda = −balance   (solo cuando el balance es negativo)

Un balance positivo en una tarjeta es saldo a favor (un pago de más o una
devolución), no deuda negativa: ahí la deuda es 0. Y un balance negativo en una
cuenta normal es un descubierto, que es otra cosa y no se mide contra ningún
límite. Todo esto vive en `src/lib/credit.ts`, compartido entre cliente y
servidor igual que `balance.ts`.

Hay un test que ata `credit.ts` a `balance.ts`: si alguien cambiara el signo de
un `EXPENSE`, la deuda pasaría a calcularse al revés y fallaría.

### `credit_limit` (migración 0002)

`REAL` nullable, con `CHECK (credit_limit IS NULL OR credit_limit > 0)`. Null
significa **sin configurar**, y entonces la app no calcula porcentaje en vez de
inventárselo.

La regla de que solo una `CREDIT_CARD` pueda tenerlo **no cabe en el esquema**:
tendría que mirar `type`, y SQLite no deja añadir un CHECK de tabla con `ALTER
TABLE`. La impone `routes/accounts.ts`, con tests de API que lo cubren. Al
cambiar una tarjeta a otro tipo el límite se limpia, para que no reaparezca al
volver a convertirla en tarjeta.

### Semáforo

Los cortes salen de la guía real de crédito (bajo 30 % no penaliza, bajo 10 %
es lo ideal): **0–9 excelente · 10–29 bien · 30–49 aviso · 50–79 malo · 80+
crítico**.

Dos decisiones que conviene no deshacer sin pensarlo:

1. **El nivel se decide sobre el porcentaje ya redondeado**, el mismo número
   que se enseña. Sobre el exacto, un 29,6 % se mostraría como «30 %» junto al
   texto «por debajo del 30 % recomendado», que se lee como una contradicción.
2. **El color nunca va solo.** Cada nivel lleva etiqueta ("Atención",
   "Crítico"…) y una frase que explica qué significa, porque quien no distingue
   el verde del rojo tiene que enterarse igual (§10). La barra además es un
   `role="meter"` con su `aria-label`.

### Agregado

La utilización total se calcula sobre **la suma de deudas dividida entre la
suma de límites**, no promediando porcentajes: una tarjeta de 10 000 al 50 % y
otra de 100 al 0 % dan 49,5 %, no 25 %. Las tarjetas sin límite quedan fuera del
porcentaje (no hay contra qué medirlas) pero **sí cuentan en la deuda**, y la UI
avisa de cuántas son.

### Activos, deuda y neto

La pantalla de Cuentas enseña tres cifras en vez de un total revuelto, y separa
las tarjetas en su propia sección. `net = activos − deuda` **coincide con el
`totalBalance` que ya calculaba el servidor** — no es una cifra nueva que pueda
contradecir al dashboard, es la misma suma vista de otra forma. Hay un test que
lo comprueba.

Los agregados respetan `includeInTotal` (§8.1), la misma regla del balance
total: aplicar aquí un criterio distinto haría que una cuenta contase en una
pantalla y no en otra.

### Exportar / importar

`creditLimit` viaja en el JSON de exportación (aunque sea null): sin él,
reimportar un respaldo dejaría las tarjetas sin límite. Al importar se aplican
las mismas dos reglas que el API, pero un archivo viejo o tocado a mano **no
invalida la importación entera**: esa cuenta entra sin límite, que es un estado
válido. Un CSV no trae tipos de cuenta, así que de ahí nunca salen tarjetas.

---

## 13. Colchón por cuenta y cuadre

### Colchón (migración 0003)

Un **colchón** es el mínimo que no se quiere tocar. El dinero sigue en la cuenta
—el balance no cambia— pero deja de contar como disponible:

    disponible = balance − colchón

Tres campos nuevos, todos con valor por defecto para que las cuentas que ya
existían se comporten **exactamente igual que antes**: `buffer_amount` (REAL,
0, con `CHECK >= 0`), `buffer_applied` (INTEGER, 1) y `last_reconciled_at`
(INTEGER, nullable). Con colchón 0 la UI no enseña ni una palabra de más.

`buffer_applied` sirve para dos cosas a la vez: si se apaga, el importe se
conserva pero no se descuenta; y es el valor que la pantalla de cuadre propone
marcado o desmarcado, que es lo que se pidió — que la elección se recuerde.

Cuando hay colchón, la UI enseña **siempre las dos cifras**. Solo el disponible
escondería dinero que existe de verdad; solo el balance es justo lo que hace
creer que hay más de lo que se puede gastar.

**El disponible puede salir negativo y se muestra tal cual, en rojo.** Recortarlo
a 0 ocultaría que se está por debajo del propio mínimo, que es justo lo que hay
que ver.

En una **tarjeta** el colchón no significa nada: no hay saldo del que apartar
una parte, sino deuda. Ni se aplica ni se ofrece, y el API lo rechaza.

### Cuadre — y en qué se diferencia de §8.3

**Ya existía un mecanismo parecido y no se ha duplicado**: editar el «balance
actual» de una cuenta (§8.3) despeja el balance inicial para que cuadre. La
diferencia es de fondo:

|                   | Editar balance actual (§8.3)                     | Cuadrar (nuevo)                  |
| ----------------- | ------------------------------------------------ | -------------------------------- |
| Qué toca          | El balance **inicial**                           | Crea una **transacción**         |
| Rastro            | Ninguno                                          | Un movimiento con fecha y nota   |
| Se puede deshacer | No                                               | Sí, borrando la transacción      |
| Para qué sirve    | Corregir el punto de partida de una cuenta nueva | Cuadre periódico contra el banco |

Los dos se quedan, porque resuelven cosas distintas. Para un cuadre que se
repite cada mes se quiere el rastro; para arreglar el saldo inicial de una
cuenta recién creada, no.

El endpoint es `POST /api/accounts/:id/reconcile`. El balance calculado **se lee
en la misma petición**, no se acepta del cliente: si no, se podría cuadrar
contra una cifra ya caducada.

Decisiones que conviene no deshacer:

- **Umbral de medio céntimo.** Los balances son `REAL`; sin umbral, cuadrar una
  cuenta ya cuadrada crearía un ajuste de 4e−17. Si la diferencia queda por
  debajo, no se crea nada y solo se apunta la fecha.
- **El importe se redondea a céntimos.** El ajuste acaba en el historial del
  usuario, y `200 − 154.1` da `45.900000000000006`. El saldo puede quedar a
  menos de medio céntimo del real, que está por debajo del umbral y por tanto
  no se acumula.
- **Categoría del ajuste**: «Otros» del tipo que toque (INCOME o EXPENSE), que
  existe en toda cuenta sembrada. Si el usuario la borró, el ajuste va sin
  categoría antes que fallar el cuadre entero.
- El `adjustmentId` lo genera el cliente, así que reenviar un cuadre pendiente
  desde la cola offline no crea dos ajustes (§9).

---

## 14. Gastos fijos (migración 0004)

No todo se paga cada mes. Un seguro de 600 al año no cuesta 600 un mes y 0 los
demás: cuesta **50 al mes** que habría que ir apartando.

    equivalente mensual = importe del recibo / cada cuántos meses se paga

La pantalla enseña **dos totales distintos, y los dos hacen falta**: el
equivalente mensual de todos los gastos y lo que toca pagar _este_ mes concreto.
Un mes sin recibos tiene el segundo a 0 aunque el primero sea alto, y eso es
justo lo que evita creer que ese mes sobra dinero.

### Redondeo del equivalente

**No se redondea en el cálculo, solo al pintar.** Redondeando antes, el total
sería la suma de cifras ya recortadas: doce gastos de 100/3 (33,3333…) darían
399,96 en vez de 400.

La contrapartida es que la suma de lo que se ve línea a línea puede diferir en
algún céntimo del total que se enseña. Se prefiere así: un céntimo en una línea
se perdona, un total que no cuadra con la realidad no.

### El caso del día 31 — `anchor_day`

Un recibo del 31 de enero no puede vencer el 31 de febrero: se recorta al último
día del mes, reutilizando el mismo `zonedTime` que ya usan los períodos de
presupuesto (§8.5).

**La clave es que el ancla se guarda aparte, en `anchor_day`.** Si el siguiente
salto se calculase desde el vencimiento recortado, el recibo se quedaría clavado
en el día 28 para siempre:

|     | Derivando del último vencimiento | Con `anchor_day` (lo implementado) |
| --- | -------------------------------- | ---------------------------------- |
| ene | 31                               | 31                                 |
| feb | 28                               | 28                                 |
| mar | **28** ← mal                     | **31**                             |
| abr | 28                               | 30                                 |
| may | 28                               | 31                                 |

Hay tests unitarios y de API de esa serie exacta, incluido el 29 de febrero de
un año bisiesto.

### Marcar como pagado

Crea la transacción **real** en la cuenta indicada y avanza el vencimiento, todo
en un mismo batch: o pasan las dos cosas o ninguna. **Nunca ocurre solo** — la
app no genera transacciones automáticas, hace falta confirmar.

Borrar un gasto fijo es lógico y **no borra los pagos ya registrados**: son
gastos que ocurrieron de verdad y borrarlos descuadraría los balances.

Un gasto inactivo sigue en la lista pero ni suma al equivalente ni avisa, y cae
siempre al final de la ordenación.

---

## 15. Duplicar transacciones

Dos caminos distintos a propósito:

- **Una sola** → `/transacciones/nueva?duplicar=<id>`. **No crea nada**: abre el
  alta prellenada con la fecha de hoy para que el usuario confirme o ajuste. Lo
  que se guarda es una transacción nueva; la original no se toca nunca.
- **Varias** → `POST /api/transactions/duplicate { ids, date }`. Aquí no hay
  formulario que confirmar una por una, así que el trabajo lo hace el servidor
  de una vez.

### Transferencias

Duplicar una pata suelta dejaría las cuentas descuadradas — exactamente el bug
de §8.2. Por eso:

1. Una transferencia se duplica como **par completo**, con un
   `transferGroupId` **nuevo**.
2. Se **deduplica por grupo**: si se marcan las dos patas en la lista, se
   duplica una vez. Sin esto, seleccionar todo crearía el doble de
   transferencias.
3. Da igual desde qué pata se duplique: siempre se reconstruye desde la
   saliente, así que el dinero sale de donde salía.
4. Una transferencia huérfana importada de Android (sin pareja, §8.2) **se
   salta**: sin destino no se puede reconstruir el par.

Los enlaces a presupuestos se copian: duplicar es «otra igual», y el enlace es
parte de la transacción original.

### El patrón de la UI

La petición pedía que la acción fuese alcanzable sin hover en móvil y **sin
inventar un patrón nuevo si ya hay uno**. La app no usa deslizar en ninguna
pantalla, así que no se ha añadido aquí:

- en el detalle, un botón de icono en la cabecera, junto al de eliminar — el
  mismo sitio donde ya viven las acciones de cuentas, categorías y presupuestos;
- en la lista, un botón «Seleccionar» en la cabecera que activa el modo
  selección; en ese modo las filas marcan en vez de navegar, y la acción aparece
  en una barra fija abajo, al alcance del pulgar.

---

## 16. Auditoría del ciclo de vida de una transferencia

Revisión pedida expresamente para comprobar que el bug de §8.2 está cerrado, sin
reescribir nada. **Conclusión: está cerrado.** No hizo falta ningún arreglo.

### Qué se auditó y qué salió

| Operación                     | Resultado                                                       |
| ----------------------------- | --------------------------------------------------------------- |
| Crear                         | Dos patas, mismo grupo, cuentas cruzadas ✔                      |
| Editar importe, fecha o nota  | Las dos se mueven juntas ✔                                      |
| Cambiar **solo** el origen    | El dinero sale de la cuenta nueva; el destino no se toca ✔      |
| Cambiar **solo** el destino   | Simétrico ✔                                                     |
| Intercambiar origen y destino | Invierte el sentido sin dejar restos ✔                          |
| Borrar la transferencia       | Se lleva las dos patas ✔                                        |
| Borrar una **cuenta**         | Se lleva las dos patas; el saldo de la otra vuelve a su sitio ✔ |
| Exportar e importar JSON      | Sobrevive con su par, su grupo y sus saldos ✔                   |
| 5 ediciones seguidas          | Patrimonio total a 0 en cada paso ✔                             |

### El hueco `ON DELETE CASCADE` frente a `ON DELETE SET NULL`

En `transactions`, `account_id` es CASCADE y `transfer_account_id` es SET NULL.
La sospecha era: al borrar una cuenta, una pata se borra y la otra sobrevive
convertida en una transferencia a ninguna parte.

**El hueco existe en el esquema y está demostrado con un test** que borra la
cuenta con SQL directo, saltándose el API: la pata de la cuenta borrada
desaparece y la otra queda con `transfer_account_id = NULL`. Las claves foráneas
de D1 están activas, así que el mecanismo es real.

**Pero no es alcanzable**, por dos motivos independientes:

1. **El borrado de cuentas del API es lógico** (`deleted_at`), así que la clave
   foránea nunca se dispara. Y `DELETE /api/accounts/:id` marca además todas las
   transacciones donde la cuenta aparece **como origen o como destino**, así que
   tampoco deja patas sueltas por su cuenta.
2. **El único borrado físico de cuentas de todo el código** está en la
   importación (`sentenciasDeBorrado`), y ahí las transacciones se borran
   **antes** que las cuentas: cuando llega el `DELETE` de `wallet_accounts` ya no
   queda ninguna fila que cascadear.

Por eso **no se ha tocado el esquema**: cambiar la clave foránea no arreglaría
nada que hoy pueda romperse, y alterar una FK en SQLite obliga a recrear la
tabla entera — riesgo real a cambio de ningún beneficio.

Lo que sí quedan son **dos tests de regresión** que vigilan las condiciones de
las que depende esa conclusión: que ninguna ruta del API borre cuentas
físicamente, y que tras importar no quede ninguna transacción apuntando a una
cuenta inexistente. Si alguien añade un borrado físico, fallan.

### Transferencias huérfanas de Android

El importador ya las trata: empareja las dos patas por importe, fecha y cuentas,
y las que no encuentran pareja **se importan igual** —el dinero estuvo ahí— y se
cuentan aparte en `transferenciasHuerfanas` del resumen, para poder revisarlas.
Al duplicar, una pata huérfana se salta: sin destino no hay par que reconstruir.

---

## 17. Barra lateral con scroll y geometría del switch

Dos arreglos de UI en escritorio, ambos **medidos en el navegador antes y
después** con `scripts/diagnostico-ui.mjs`.

### La barra lateral se recortaba

El `<nav>` era una sola columna sin `overflow`, así que cuando la lista no cabía
los últimos elementos quedaban cortados y no había forma de llegar a ellos.

Dónde ocurría de verdad: **no en escritorio, sino en el rail estrecho**, donde
cada ítem ocupa el doble por llevar el texto debajo del icono. Medido a 900×560:
`scrollHeight` 672 contra `clientHeight` 560 — «Ajustes» y el botón de «Atajos»
quedaban fuera. En la barra ancha sí cabía todo, incluso con la ventana baja.
Con el zoom del navegador subido se cae en el rail estrecho, que es como se topa
uno con esto sin tener una tablet.

Ahora son **tres zonas**: logo fijo arriba, lista con `overflow-y-auto` en medio
y «Atajos» fijo abajo. La clave es el **`min-h-0`** del contenedor central:
dentro de un flex column, un hijo `flex-1` tiene `min-height: auto` y se niega a
encoger por debajo de su contenido, así que sin eso el `overflow` no se activa
nunca.

La barra de scroll solo aparece cuando hace falta (`auto`, no `scroll`).

#### Segunda pasada: el scroll no puede robar ancho

El primer arreglo trajo dos problemas nuevos, vistos en producción y no por los
tests: **rótulos recortados** y una **barra de scroll horizontal** con flechas.

Tres causas, las tres arregladas:

1. **`overflow-x: hidden`.** Con `auto` en los dos ejes, un ítem que se pasa
   cuatro píxeles saca barra horizontal y deja el menú desplazable de lado — y
   al desplazarse, los rótulos se cortan **por la izquierda**.
2. **`scroll-sin-barra`** (utilidad nueva en `styles.css`). La barra clásica de
   Windows ocupa unos 15 px **reales** y se los quita al contenido; en una barra
   estrecha eso basta para recortar los rótulos. Se oculta y el scroll sigue
   funcionando con rueda, teclado y dedo.
3. **`min-w-0` en el enlace y `max-w-full` en el rótulo.** Sin `min-w-0`,
   `truncate` no llega a activarse nunca: el `white-space: nowrap` que lleva
   dentro fija el ancho mínimo al del texto entero, así que era el propio ítem
   el que ensanchaba la barra.

Además, el rail estrecho usa ahora **rótulos cortos** (`corto` en `SECCIONES`),
que es lo que decía el comentario del layout desde el principio: en 55 px útiles
"Transacciones" no cabe de ninguna manera. El nombre completo sigue en el
`title`.

> **Por qué se escapó a los tests:** en un Chromium headless las barras de
> scroll son **overlay** y no roban ancho (medido: 0 px), mientras que las de
> Windows sí. Un test de DOM puede dar verde y el usuario ver los rótulos
> cortados igualmente. Por eso el diagnóstico se hace con captura real
> (`scripts/diagnostico-sidebar.mjs`), no solo midiendo.

### El círculo del switch se salía de la pista

Iba con `translate-x-5.5` y **sin `left`**, así que su posición dependía de dónde
lo dejara el flujo estático. Medido: estando encendido sobresalía **20 px por la
derecha** de una pista de 44 px.

Ahora la geometría es explícita: pista 44×24, bola 20×20 anclada con `left-0.5
top-0.5` y `translate-x-5` al encender. Resultado medido: 2 px de aire por los
cuatro lados en los dos estados.

Se arregló en `SwitchField`, así que vale para todos los interruptores de la app,
no solo para el que se vio.

---

## 18. «Disponible real»: una sola cuenta de la verdad

Antes cada pantalla sumaba lo suyo y el mismo concepto salía con cifras
distintas. Ahora la cabecera, el Dashboard y la pantalla de Cuentas llaman las
tres a `summarizeNetWorth` (`src/lib/patrimonio.ts`), así que **no pueden
discrepar** por construcción.

### Dos preguntas distintas, dos números

    puedoGastarHoy = activos − colchones
    disponibleReal = activos − colchones − deuda de tarjetas

La primera contesta «cuánto puedo gastar hoy sin tocar mis colchones». La
segunda, «cuánto tengo de verdad»: ahí la deuda de la tarjeta cuenta, porque es
dinero que ya se debe aunque todavía no haya salido de la cuenta. Se enseñan
**las dos**, porque perder la primera dejaba sin respuesta una pregunta que se
hace a diario.

`disponibleReal` puede salir muy negativo, y se muestra tal cual: taparlo sería
lo contrario de para lo que sirve. En rojo, salvo en la tarjeta verde del
Dashboard, donde el texto ya va en blanco y el rojo no se leería — ahí lo
distinguen el signo y el desglose.

### `includeInTotal` también manda en las tarjetas

Una tarjeta excluida del total **no suma deuda**, igual que una cuenta excluida
no suma saldo. Si la deuda contase pero el saldo no, el mismo flag significaría
cosas distintas según el tipo de cuenta, que es justo la clase de sorpresa que
hay que evitar. La tarjeta sigue apareciendo en su lista con su utilización.

### Desglose auditable

Bajo la cifra hay un desplegable con **activos − colchones − deuda = disponible
real**. Las líneas que valen cero se omiten, para que quien no usa colchones ni
tiene tarjetas no vea ruido. Hay un e2e que comprueba que la resta cuadra y que
las tres pantallas enseñan la misma cifra.

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

## 19. Importar los gastos fijos del Excel

El usuario lleva sus gastos fijos en una hoja de cálculo y quiere **seguir
llevándolos ahí**. Por eso lo que se añadió no es un script de carga de una sola
vez sino una **importación por pegado**: se pega la tabla, se ve lo que va a
pasar y se confirma. Cuando la hoja cambie, se vuelve a pegar.

### La cifra que manda: 556,25

Los 13 gastos de la hoja tienen que dar **exactamente 556,25 al mes**. Es el
número que él ya lee en su Excel, así que sirve de prueba de fuego del cálculo:
si no sale, el error está en el equivalente mensual, no en el redondeo.

Sale exacto sin trucos porque el equivalente no se redondea hasta pintarlo
(§14): 112 + 112/12 + 50 + 45 + 9 + 200 + 200/12 + 9 + 33/6 + 390/12 + 51 +
61/6 + 73/12 = 556,25. Está clavado en un test unitario y en uno de API.

### Semanal = mensual / 4, y es deliberado

Lo correcto en calendario sería 365,25/12/7 ≈ 4,348 semanas por mes. **Aquí se
divide entre 4**, que es lo que hace la hoja del usuario. Con el número «bueno»
la app y el Excel discreparían en cada línea (139,06 frente a 127,93) y la cifra
dejaría de servirle para comparar, que es justo para lo que la usa.

Vive en `SEMANAS_POR_MES`, con el porqué escrito al lado. Si algún día se quiere
la conversión de calendario hay que cambiarla en los dos sitios a la vez.

### Idempotencia: la clave es el nombre normalizado

La hoja no guarda identificadores, así que la única clave natural es el nombre.
`claveDeNombre` lo normaliza —sin acentos, sin mayúsculas, espacios colapsados—
de modo que el «TELEFONO» del Excel reconoce al «Teléfono» ya guardado. Pegar
dos veces la misma tabla actualiza; no duplica.

### Qué se sincroniza y qué NO — la decisión importante

El Excel solo tiene cuatro columnas: nombre, categoría, importe y cada cuántos
meses. **El vencimiento y la cuenta de la que sale el dinero no están ahí** y se
rellenan después desde la app.

Por eso, al reconocer un gasto que ya existe, la importación **solo pisa lo que
el Excel sabe de verdad** (importe, periodicidad y categoría) y deja intactos
`next_due_date`, `account_id`, `is_active` y la nota. Si no fuera así, volver a
pegar la hoja para actualizar un precio borraría de golpe todas las fechas y
cuentas configuradas a mano — justo el trabajo que la hoja no puede reponer.

Hay un test de API dedicado solo a esto, porque es la regla que sostiene todo el
diseño del endpoint.

### Categorías: se crean las que falten

De las 7 de la hoja, tres ya venían de la siembra del registro (Transporte,
Entretenimiento, Salud) y cuatro se crean en la importación (Tecnología,
Alimentación, Personal, Hogar). Se casan por nombre normalizado, así que no se
duplican las que ya estaban.

El icono sale de una tabla de nombres conocidos y cae en el genérico si no
reconoce; el color se deriva **del nombre por un hash estable**, no del orden de
llegada, para que la misma categoría salga siempre del mismo color.

### El parser es tolerante a propósito

`parsePastedFixedExpenses` admite tabulador (lo que copia Excel), barra vertical
(una tabla de Markdown), punto y coma y varios espacios. Ignora la cabecera y el
separador de Markdown sin que haya que quitarlos.

**La coma NO es separador, y es deliberado**: un importe como `1,234.56` la
lleva dentro y partir por comas rompería justo las filas de los gastos más
caros. Para CSV separado por comas está el importador de §12.

Una fila mala no cuesta la importación entera: se recoge en `issues`, se enseña
en el diálogo con su número de línea y las demás siguen — el mismo criterio que
`parseCsv`.

### Agrupación por categoría con subtotales

La pantalla gana una tercera vista, «Categoría», que agrupa con subtotales como
la hoja de cálculo, ordenada de mayor a menor gasto mensual y con «sin
categoría» siempre al final. Los subtotales solo cuentan los activos, para que
**sumen exactamente el total de la cabecera**; hay un test que lo comprueba,
porque dos verdades distintas en la misma pantalla serían peores que ninguna.

### Lo que quedó pendiente de decidir

La fecha del próximo pago y la cuenta de cada gasto **no están en el Excel**. El
diálogo las pide una sola vez y las aplica a los gastos nuevos (la fecha por
defecto es hoy, la cuenta puede quedar sin asignar), y se afinan después desde
cada gasto. Importa sobre todo en los que no son mensuales: Google AI Plus,
Marbete, Planet Fitness, Costco Gold Star, Creatina y Perfume.

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

### Registro cerrado

`ALLOW_SIGNUP` pasó a `"false"` el 9-ago-2026, en cuanto el usuario creó su
cuenta. No se podía cerrar antes: la cuenta la tiene que crear él, que es quien
elige la contraseña.

Antes de tocar la variable se comprobó en la D1 de producción que la cuenta
existía de verdad. Cerrar el registro sobre una base sin usuarios habría dejado
la app inaccesible para todos, sin forma de entrar desde fuera.

Verificado después de desplegar: un `POST /api/auth/sign-up/email` devuelve
`400 EMAIL_PASSWORD_SIGN_UP_DISABLED`, el login sigue respondiendo (`401` con
credenciales falsas, no un error de configuración) y la tabla `user` sigue
teniendo exactamente una fila.

**Lighthouse sigue sin poder ejecutarse en esta máquina** (`EPERM` al limpiar su
perfil temporal). Ahora que hay una URL pública se puede medir desde PageSpeed
Insights, sin depender del Chrome local.
