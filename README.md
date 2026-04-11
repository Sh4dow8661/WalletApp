# 💰 WalletApp

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" />
  <img src="https://img.shields.io/badge/Language-Kotlin-7F52FF?style=for-the-badge&logo=kotlin&logoColor=white" />
  <img src="https://img.shields.io/badge/UI-Jetpack%20Compose-4285F4?style=for-the-badge&logo=jetpackcompose&logoColor=white" />
  <img src="https://img.shields.io/badge/Min%20SDK-24-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" />
</p>

<p align="center">
  Aplicación Android de finanzas personales <strong>100% offline</strong>, inspirada en Wallet by BudgetBakers.
  Sin servidores, sin cuentas, sin internet — tus datos se quedan en tu dispositivo.
</p>

---

## ✨ Características

- **Totalmente offline** — no requiere permiso de internet
- Registro de **ingresos, gastos y transferencias**
- **Múltiples cuentas** (Efectivo, Banco, Tarjeta de Crédito) con balances independientes
- **Categorías** predefinidas con íconos y soporte para crear personalizadas
- **Presupuestos mensuales** por categoría con barra de progreso y alertas
- **Dashboard** con balance total y resumen del mes
- **Estadísticas** con gráfica circular por categoría y barras de tendencia mensual
- **Vista de calendario** con mapa de calor de gasto diario
- Lista de transacciones con **filtros** por categoría y cuenta
- **Exportación a CSV** en almacenamiento local
- **Tema claro / oscuro / sistema** y moneda configurable
- **Material Design 3** con navegación inferior y FAB

---

## 🛠 Stack técnico

| Capa | Tecnología |
|------|-----------|
| Lenguaje | Kotlin |
| UI | Jetpack Compose + Material 3 |
| Arquitectura | MVVM + Clean Architecture |
| Persistencia | Room |
| DI | Hilt |
| Async | Coroutines + Flow |
| Preferencias | DataStore |
| Gráficas | Canvas puro (sin dependencias externas) |

> No se usan Retrofit, Firebase ni ningún permiso de red.

---

## 🗂 Estructura del proyecto

```
app/src/main/java/com/walletapp/
├── WalletApplication.kt           # @HiltAndroidApp
├── MainActivity.kt
├── data/
│   ├── local/
│   │   ├── WalletDatabase.kt
│   │   ├── DefaultData.kt         # Datos por defecto al primer arranque
│   │   ├── entity/                # AccountEntity, CategoryEntity, TransactionEntity, BudgetEntity
│   │   └── dao/                   # AccountDao, CategoryDao, TransactionDao, BudgetDao
│   ├── repository/                # Implementaciones de repositorios
│   └── preferences/SettingsDataStore.kt
├── domain/
│   ├── model/                     # Account, Category, Transaction, Budget + mappers
│   └── repository/                # Interfaces de repositorio
├── di/
│   ├── DatabaseModule.kt
│   └── RepositoryModule.kt
└── ui/
    ├── theme/
    ├── navigation/
    ├── components/                # CategoryIcon, PieChartView, BarChartView
    └── screens/
        ├── dashboard/
        ├── transactions/
        ├── budgets/
        ├── statistics/
        ├── calendar/
        ├── settings/
        ├── accounts/
        └── categories/
```

---

## 🚀 Cómo compilar

1. Clona el repositorio:
   ```bash
   git clone https://github.com/TU_USUARIO/WalletApp.git
   ```
2. Abre la carpeta `WalletApp/` en **Android Studio Hedgehog (2023.1)** o más reciente.
3. Sincroniza Gradle — la primera vez descargará todas las dependencias.
4. Ejecuta en un emulador o dispositivo con **Android 7.0 (API 24)** o superior.

---

## 📱 Pantallas

| Pantalla | Descripción |
|----------|-------------|
| **Inicio** | Balance total, resumen mensual, cuentas y transacciones recientes |
| **Transacciones** | Lista filtrable por mes, categoría y cuenta |
| **Presupuestos** | Lista mensual con barra de progreso por categoría |
| **Estadísticas** | Pie chart por categoría, tendencia de 6 meses |
| **Ajustes** | Cuentas, categorías, moneda, tema, exportar CSV |

El **FAB** abre el formulario para registrar una transacción. El ícono superior del Inicio abre la **vista de calendario** con mapa de calor de gastos diarios.

---

## 📝 Notas

- En el **primer arranque** se insertan automáticamente las cuentas (`Efectivo`, `Banco`, `Tarjeta de Crédito`) y las categorías por defecto.
- El CSV se guarda en `Android/data/com.walletapp/files/exports/` (almacenamiento privado, accesible desde el gestor de archivos).
- Las **transferencias** generan dos transacciones internas para mantener consistencia de balances.
- No se incluye `INTERNET` en el `AndroidManifest.xml`.

---

## 📄 Licencia

Distribuido bajo la licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más información.
