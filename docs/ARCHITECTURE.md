# Arquitectura de la migración a PWA — Fase 0

Documento de reconocimiento y plan. Escrito antes de mover un solo archivo.
Rama de trabajo: `claude/app-progressive-web-app-2zwq2z` (creada desde `main`).

---

## 1. Estado verificado del entorno

Todo lo de esta tabla está comprobado ejecutando el comando, no supuesto.

| Herramienta | Resultado | Nota |
|---|---|---|
| Node | **v26.7.0** | Cumple el requisito de Node 20+. Versión muy reciente; vigilar incompatibilidades con Vite/Vitest. |
| npm | 11.19.0 | Disponible |
| pnpm | **no instalado** | Los criterios de aceptación de §14 hablan de `pnpm dev/test/build`. Propongo instalarlo (`npm i -g pnpm`) en la Fase 1. |
| wrangler | 4.120.0 (vía `npx`) | Sin autenticar todavía |
| git | 2.55.0.windows.3 | |
| JDK | `C:\Users\imano\.jdks\jbr-17.0.14` (17.0.14) y JBR 21 de Android Studio | AGP 8.5.2 requiere JDK 17: se usa el primero |
| Android SDK | `C:\Users\imano\AppData\Local\Android\Sdk` | build-tools, platforms, ndk, emulator presentes |
| Android Studio | `C:\Program Files\Android` | |
| Gradle wrapper | 8.7 · AGP 8.5.2 · Kotlin 2.0.20 | |
| adb | Presente, **sin dispositivos conectados** | Relevante para la Fase 7 |
| Zona horaria del PC | **UTC−04:00 — "Georgetown, La Paz, Manaus, San Juan"** → IANA `America/La_Paz` | Ver duda D3 |
| **Build de Android** | **`./gradlew :app:testDebugUnitTest` → BUILD SUCCESSFUL en 6m 2s**, 30 tareas, los 28 tests en verde | Solo avisos de `Icons.Filled.ArrowBack`/`TrendingUp` deprecados. **El entorno Android compila**, así que la ruta "Exportar todo (JSON)" de §12 es viable |
| Cloudflare | `wrangler whoami` → autenticado por OAuth como `imanolhidalgo08@gmail.com`, cuenta `2b01dff5d63dd90ebe52d18cc3914ea7` (la de §5) | `wrangler d1 list` responde `[]`: acceso a D1 correcto y **no hay ninguna base creada todavía** |

Los 6 minutos del build son un dato en sí mismo: es un build limpio, pero corriendo sobre `G:\`.
Ver riesgo R1.

### Repo

| | |
|---|---|
| Ruta local | `G:\My Drive\Personal\[04] Claude\Proyectos\WalletApp\WalletApp` |
| Remoto real | `https://github.com/Sh4dow8661/WalletApp_Claude.git` |
| Remoto en el prompt (§1) | `https://github.com/Sh4dow8661/WalletApp` |
| Ramas remotas | `main`, `claude/festive-wozniak-eZpTm`, `__tmp_probe__` |
| Rama `claude/app-progressive-web-app-2zwq2z` | **No existía**; creada en local desde `main` |
| Estado | Limpio, 12 commits, último `f5c63d8` |
| Secretos | `keystore.properties` y `local.properties` **no versionados** (correcto) |

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

### D1 — Ubicación del repo → **mover a `C:\dev\WalletApp`** *(pendiente de ejecutar)*
Decidido sacar el repo de Google Drive por los motivos de R1. La copia en Drive y el APK se
conservan como respaldo; el historial y las ramas viajan intactos.
**Estado: sin ejecutar.** El movimiento se hará antes de instalar dependencias — es justo el paso
en el que Drive empieza a doler.

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

### D4 — Remoto → **`github.com/Sh4dow8661/WalletApp_Claude`**
Es el remoto realmente configurado. Prevalece sobre la URL de §1 del prompt.

### D5 — Gestor de paquetes → **pnpm**
Se instalará con `npm i -g pnpm` para que los comandos de §14 (`pnpm dev`, `pnpm test`,
`pnpm build`) funcionen literalmente.
