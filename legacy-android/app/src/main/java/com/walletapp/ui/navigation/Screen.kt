package com.walletapp.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.graphics.vector.ImageVector

sealed class Screen(val route: String) {
    data object Dashboard : Screen("dashboard")
    data object Transactions : Screen("transactions")
    data object Budgets : Screen("budgets")
    data object Statistics : Screen("statistics")
    data object Settings : Screen("settings")

    data object Calendar : Screen("calendar")
    data object AddEditTransaction : Screen("transaction/edit?id={id}") {
        fun create(id: Long? = null) = "transaction/edit?id=${id ?: -1L}"
    }
    data object AddEditBudget : Screen("budget/edit?id={id}") {
        fun create(id: Long? = null) = "budget/edit?id=${id ?: -1L}"
    }
    data object AddEditAccount : Screen("account/edit?id={id}") {
        fun create(id: Long? = null) = "account/edit?id=${id ?: -1L}"
    }
    data object AddEditCategory : Screen("category/edit?id={id}") {
        fun create(id: Long? = null) = "category/edit?id=${id ?: -1L}"
    }
    data object Accounts : Screen("accounts")
    data object Categories : Screen("categories")
    data object ScanReceipt : Screen("scan-receipt")
}

data class BottomNavItem(
    val screen: Screen,
    val label: String,
    val icon: ImageVector
)

val bottomNavItems = listOf(
    BottomNavItem(Screen.Dashboard, "Inicio", Icons.Default.Dashboard),
    BottomNavItem(Screen.Transactions, "Transacciones", Icons.Default.Receipt),
    BottomNavItem(Screen.Budgets, "Presupuestos", Icons.Default.PieChart),
    BottomNavItem(Screen.Statistics, "Estadísticas", Icons.Default.BarChart),
    BottomNavItem(Screen.Settings, "Ajustes", Icons.Default.Settings)
)
