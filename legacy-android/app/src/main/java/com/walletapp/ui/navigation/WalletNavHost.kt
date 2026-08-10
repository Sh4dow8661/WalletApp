package com.walletapp.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.walletapp.ui.screens.accounts.AccountsScreen
import com.walletapp.ui.screens.accounts.AddEditAccountScreen
import com.walletapp.ui.screens.budgets.AddEditBudgetScreen
import com.walletapp.ui.screens.budgets.BudgetsScreen
import com.walletapp.ui.screens.calendar.CalendarScreen
import com.walletapp.ui.screens.categories.AddEditCategoryScreen
import com.walletapp.ui.screens.categories.CategoriesScreen
import com.walletapp.ui.screens.dashboard.DashboardScreen
import com.walletapp.ui.screens.scanreceipt.ScanReceiptScreen
import com.walletapp.ui.screens.settings.SettingsScreen
import com.walletapp.ui.screens.statistics.StatisticsScreen
import com.walletapp.ui.screens.transactions.AddEditTransactionScreen
import com.walletapp.ui.screens.transactions.TransactionsScreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletNavHost() {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = currentRoute in bottomNavItems.map { it.screen.route }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    bottomNavItems.forEach { item ->
                        NavigationBarItem(
                            selected = currentRoute == item.screen.route,
                            onClick = {
                                if (currentRoute != item.screen.route) {
                                    navController.navigate(item.screen.route) {
                                        popUpTo(Screen.Dashboard.route) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            },
                            icon = { Icon(item.icon, contentDescription = item.label) },
                            label = { androidx.compose.material3.Text(item.label) }
                        )
                    }
                }
            }
        },
        floatingActionButton = {
            if (currentRoute == Screen.Dashboard.route ||
                currentRoute == Screen.Transactions.route
            ) {
                FloatingActionButton(
                    onClick = { navController.navigate(Screen.AddEditTransaction.create()) }
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Agregar transacción")
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Dashboard.route,
            modifier = androidx.compose.ui.Modifier.padding(padding)
        ) {
            composable(Screen.Dashboard.route) {
                DashboardScreen(
                    onAddTransaction = { navController.navigate(Screen.AddEditTransaction.create()) },
                    onOpenCalendar = { navController.navigate(Screen.Calendar.route) },
                    onOpenAccounts = { navController.navigate(Screen.Accounts.route) },
                    onOpenTransaction = { id ->
                        navController.navigate(Screen.AddEditTransaction.create(id))
                    }
                )
            }
            composable(Screen.Transactions.route) {
                TransactionsScreen(
                    onOpenTransaction = { id ->
                        navController.navigate(Screen.AddEditTransaction.create(id))
                    },
                    onScanReceipt = { navController.navigate(Screen.ScanReceipt.route) }
                )
            }
            composable(Screen.Budgets.route) {
                BudgetsScreen(
                    onAddBudget = { navController.navigate(Screen.AddEditBudget.create()) },
                    onOpenBudget = { id -> navController.navigate(Screen.AddEditBudget.create(id)) }
                )
            }
            composable(Screen.Statistics.route) { StatisticsScreen() }
            composable(Screen.Settings.route) {
                SettingsScreen(
                    onOpenAccounts = { navController.navigate(Screen.Accounts.route) },
                    onOpenCategories = { navController.navigate(Screen.Categories.route) }
                )
            }

            composable(Screen.Calendar.route) {
                CalendarScreen(onBack = { navController.popBackStack() })
            }

            composable(
                route = Screen.AddEditTransaction.route,
                arguments = listOf(navArgument("id") {
                    type = NavType.LongType; defaultValue = -1L
                })
            ) {
                AddEditTransactionScreen(onBack = { navController.popBackStack() })
            }

            composable(Screen.ScanReceipt.route) {
                ScanReceiptScreen(
                    onBack = { navController.popBackStack() },
                    onManualEntry = {
                        // Cae al alta manual normal y saca el escaneo de la pila.
                        navController.navigate(Screen.AddEditTransaction.create()) {
                            popUpTo(Screen.ScanReceipt.route) { inclusive = true }
                        }
                    }
                )
            }

            composable(
                route = Screen.AddEditBudget.route,
                arguments = listOf(navArgument("id") {
                    type = NavType.LongType; defaultValue = -1L
                })
            ) {
                AddEditBudgetScreen(onBack = { navController.popBackStack() })
            }

            composable(Screen.Accounts.route) {
                AccountsScreen(
                    onBack = { navController.popBackStack() },
                    onAddAccount = { navController.navigate(Screen.AddEditAccount.create()) },
                    onOpenAccount = { id -> navController.navigate(Screen.AddEditAccount.create(id)) }
                )
            }

            composable(
                route = Screen.AddEditAccount.route,
                arguments = listOf(navArgument("id") {
                    type = NavType.LongType; defaultValue = -1L
                })
            ) {
                AddEditAccountScreen(onBack = { navController.popBackStack() })
            }

            composable(Screen.Categories.route) {
                CategoriesScreen(
                    onBack = { navController.popBackStack() },
                    onAddCategory = { navController.navigate(Screen.AddEditCategory.create()) },
                    onOpenCategory = { id -> navController.navigate(Screen.AddEditCategory.create(id)) }
                )
            }

            composable(
                route = Screen.AddEditCategory.route,
                arguments = listOf(navArgument("id") {
                    type = NavType.LongType; defaultValue = -1L
                })
            ) {
                AddEditCategoryScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}
