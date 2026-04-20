package com.walletapp.ui.screens.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.walletapp.domain.model.Account
import com.walletapp.domain.model.Category
import com.walletapp.domain.model.Transaction
import com.walletapp.domain.model.TransactionType
import com.walletapp.ui.components.CategoryIconCircle
import com.walletapp.ui.components.parseColor
import com.walletapp.ui.theme.ExpenseRed
import com.walletapp.ui.theme.IncomeGreen
import com.walletapp.util.CurrencyFormatter
import com.walletapp.util.DateUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onAddTransaction: () -> Unit,
    onOpenCalendar: () -> Unit,
    onOpenAccounts: () -> Unit,
    onOpenTransaction: (Long) -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("WalletApp") },
                actions = {
                    IconButton(onClick = onOpenCalendar) {
                        Icon(Icons.Default.CalendarMonth, contentDescription = "Calendario")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item { BalanceCard(state) }
            item { MonthSummaryRow(state) }
            item {
                Text(
                    "Cuentas",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    state.accounts.forEach { account ->
                        AccountRow(account, state.currency, onClick = onOpenAccounts)
                    }
                }
            }
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Transacciones recientes",
                        style = MaterialTheme.typography.titleMedium
                    )
                }
            }
            if (state.recentTransactions.isEmpty()) {
                item {
                    Text(
                        "Aún no hay transacciones este mes",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            } else {
                items(state.recentTransactions) { tx ->
                    TransactionRow(
                        transaction = tx,
                        category = state.categories.firstOrNull { it.id == tx.categoryId },
                        account = state.accounts.firstOrNull { it.id == tx.accountId },
                        currency = state.currency,
                        onClick = { onOpenTransaction(tx.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun BalanceCard(state: DashboardState) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        ),
        shape = RoundedCornerShape(20.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                "Balance total",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Spacer(Modifier.height(8.dp))
            Text(
                CurrencyFormatter.format(state.totalBalance, state.currency),
                style = MaterialTheme.typography.displayLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Spacer(Modifier.height(4.dp))
            Text(
                state.monthLabel,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.75f)
            )
        }
    }
}

@Composable
private fun MonthSummaryRow(state: DashboardState) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        SummaryCard(
            modifier = Modifier.weight(1f),
            label = "Ingresos",
            value = state.monthIncome,
            currency = state.currency,
            icon = Icons.Default.ArrowUpward,
            color = IncomeGreen
        )
        SummaryCard(
            modifier = Modifier.weight(1f),
            label = "Gastos",
            value = state.monthExpense,
            currency = state.currency,
            icon = Icons.Default.ArrowDownward,
            color = ExpenseRed
        )
    }
}

@Composable
private fun SummaryCard(
    modifier: Modifier = Modifier,
    label: String,
    value: Double,
    currency: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: Color
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(color.copy(alpha = 0.15f), RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center
                ) { Icon(icon, contentDescription = null, tint = color) }
                Spacer(Modifier.width(8.dp))
                Text(label, style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                CurrencyFormatter.format(value, currency),
                style = MaterialTheme.typography.titleLarge,
                color = color
            )
        }
    }
}

@Composable
fun AccountRow(account: Account, currency: String, onClick: () -> Unit = {}) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CategoryIconCircle(
                iconName = account.iconName,
                colorHex = account.colorHex
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(account.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    account.type.name,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                CurrencyFormatter.format(account.currentBalance, currency),
                style = MaterialTheme.typography.titleMedium,
                color = if (account.currentBalance >= 0) IncomeGreen else ExpenseRed
            )
        }
    }
}

@Composable
fun TransactionRow(
    transaction: Transaction,
    category: Category?,
    account: Account?,
    currency: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CategoryIconCircle(
                iconName = category?.iconName ?: "Category",
                colorHex = category?.colorHex ?: "#78909C"
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    category?.name ?: if (transaction.type == TransactionType.TRANSFER) "Transferencia" else "Sin categoría",
                    style = MaterialTheme.typography.titleMedium
                )
                Row {
                    Text(
                        account?.name ?: "",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (transaction.note.isNotBlank()) {
                        Text(
                            " · ${transaction.note}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1
                        )
                    }
                }
                Text(
                    DateUtils.formatDate(transaction.date),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            val sign = when {
                transaction.type == TransactionType.INCOME -> "+"
                transaction.type == TransactionType.EXPENSE -> "-"
                transaction.type == TransactionType.TRANSFER && transaction.isOutgoing -> "-"
                transaction.type == TransactionType.TRANSFER && !transaction.isOutgoing -> "+"
                else -> ""
            }
            val amountColor = when {
                transaction.type == TransactionType.INCOME -> IncomeGreen
                transaction.type == TransactionType.EXPENSE -> ExpenseRed
                transaction.type == TransactionType.TRANSFER && transaction.isOutgoing -> ExpenseRed
                transaction.type == TransactionType.TRANSFER && !transaction.isOutgoing -> IncomeGreen
                else -> MaterialTheme.colorScheme.primary
            }
            Text(
                "$sign${CurrencyFormatter.format(transaction.amount, currency)}",
                style = MaterialTheme.typography.titleMedium,
                color = amountColor
            )
        }
    }
}
