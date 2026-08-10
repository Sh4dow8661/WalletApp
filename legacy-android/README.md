# legacy-android — la app Android original

Aquí vive, **intacto**, el proyecto Android nativo de WalletApp tal y como estaba antes de la
migración a PWA. Se movió con `git mv`, así que el historial de cada archivo se conserva
(`git log --follow legacy-android/app/...`).

## Por qué sigue aquí

No es código muerto que se nos olvidó borrar. Tiene tres funciones concretas:

1. **Es la referencia de las reglas de negocio.** La PWA tiene que dar exactamente los mismos
   números. Cuando haya una duda sobre cómo se calcula un balance, el gasto de un presupuesto o
   el período de un presupuesto recurrente, la respuesta está en este código, no en la memoria de
   nadie. Los archivos clave están mapeados en [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
2. **Es la fuente de los datos.** La migración de los datos reales (ver `../docs/MIGRATION.md`)
   pasa por compilar este proyecto con un exportador JSON completo y sacar los datos del teléfono.
3. **Es la última versión que funciona.** Mientras la PWA no esté terminada y con los datos dentro,
   esta app es la que sigue en uso.

**No lo borres.** Está fuera del alcance de cualquier limpieza.

## Qué quedó fuera de la PWA v1

El escaneo de recibos (`ScanReceiptScreen`, `ScanReceiptViewModel`, `data/ml/ReceiptScanner`,
`ReceiptImageStore`) depende de ML Kit, que no existe en web. Ver §3.3 del plan.

Lo que **sí** se portó a TypeScript es la lógica pura de `domain/receipt/`
(`ReceiptParser`, `ReceiptCategorizer`, `ParsedReceipt`) junto con sus 28 tests, en
`src/lib/receipt/`. Ahí sigue esperando a que se enchufe un OCR de web en una v2.

## Cómo compilarlo

Requiere JDK 17 (AGP 8.5.2 no va con el 21) y el SDK de Android.

```bash
cd legacy-android
JAVA_HOME="/c/Users/imano/.jdks/jbr-17.0.14" ./gradlew.bat :app:testDebugUnitTest
```

Para generar el APK de release firmado:

```bash
cd legacy-android
JAVA_HOME="/c/Users/imano/.jdks/jbr-17.0.14" ./gradlew.bat :app:assembleRelease
```

### Archivos no versionados que hacen falta

Estos dos viajaron con el movimiento pero **no están en git** (contienen rutas y secretos):

| Archivo | Para qué |
|---|---|
| `local.properties` | `sdk.dir` — ruta al SDK de Android |
| `keystore.properties` | `storeFile`, `storePassword`, `keyAlias`, `keyPassword` de la firma de release |

`keystore.properties` apunta a `release.keystore` con ruta **relativa al módulo `app`**, es decir
`legacy-android/app/release.keystore`. Si el keystore no existe, `app/build.gradle.kts` cae de forma
automática a la clave de debug y produce un APK instalable pero no apto para Play Store.

En una máquina nueva hay que recrear los dos a mano; no se pueden reconstruir desde el repo.

## Estado técnico

| | |
|---|---|
| `versionName` / `versionCode` | 1.9.1 / 4 |
| `minSdk` / `targetSdk` / `compileSdk` | 24 / 34 / 34 |
| Gradle · AGP · Kotlin | 8.7 · 8.5.2 · 2.0.20 |
| Base de datos Room | versión 5, con 4 migraciones (`WalletDatabase.kt`) |
| Tests | 28 unitarios (`ReceiptParserTest`, `ReceiptCategorizerTest`), en verde |

## Bugs conocidos que NO se arreglan aquí

Estos se corrigen en la PWA, no en este proyecto. Se documentan para que nadie los porte de vuelta
por error:

- **Transferencias:** al editar una transferencia solo se actualiza la fila saliente; al borrarla
  solo se borra una pata; al cambiar el tipo de una transacción existente la pata hermana queda
  huérfana. Los balances se descuadran. (`AddEditTransactionViewModel.save()` / `.delete()`)
- **Presupuestos mensuales:** con ancla el día 29, 30 o 31, `BudgetPeriod.monthlyPeriod` deja días
  que no pertenecen a ningún período — el gasto de esos días desaparece del cálculo.
  (`domain/model/Budget.kt`)
- **Heatmap del calendario:** agrupa por día UTC y luego reinterpreta el resultado en hora local,
  encadenando dos desplazamientos. En UTC−4, todo gasto entre las 00:00 y las 20:00 locales aparece
  un día antes. (`TransactionDao.observeDailyExpenseInRange` + `CalendarViewModel`)

El detalle y la evidencia están en [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
