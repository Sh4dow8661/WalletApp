package com.walletapp.ui.screens.budgets

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Badge
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.walletapp.domain.model.Budget
import com.walletapp.domain.model.BudgetRecurrence
import com.walletapp.ui.theme.ExpenseRed
import com.walletapp.ui.theme.IncomeGreen
import com.walletapp.ui.theme.WarningAmber
import com.walletapp.util.CurrencyFormatter
import com.walletapp.util.DateUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BudgetsScreen(
    onAddBudget: () -> Unit,
    onOpenBudget: (Long) -> Unit,
    viewModel: BudgetsViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Presupuestos") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = onAddBudget) {
                Icon(Icons.Default.Add, contentDescription = "Nuevo presupuesto")
            }
        }
    ) { padding ->
        if (state.budgets.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text("Aún no hay presupuestos", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                Text(
                    "Crea un presupuesto, elige el período (semanal, quincenal, mensual o único) y rastrea tus gastos automáticamente",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(state.budgets, key = { it.id }) { budget ->
                    BudgetCard(
                        budget = budget,
                        currency = state.currency,
                        onClick = { onOpenBudget(budget.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun BudgetCard(
    budget: Budget,
    currency: String,
    onClick: () -> Unit
) {
    val accentColor = when {
        budget.isOverBudget -> ExpenseRed
        budget.isNearLimit  -> WarningAmber
        else                -> IncomeGreen
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {

            // ── Encabezado ──────────────────────────────────────────
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(budget.name, style = MaterialTheme.typography.titleMedium)
                        if (budget.isActive) {
                            Spacer(Modifier.width(8.dp))
                            Badge(containerColor = MaterialTheme.colorScheme.primary) {
                                Text("ACTIVO", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                    Spacer(Modifier.height(2.dp))
                    Text(
                        "${DateUtils.formatDate(budget.periodStart)} → ${DateUtils.formatDate(budget.periodEnd)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Box {
                    when {
                        budget.isOverBudget -> Icon(Icons.Default.Warning, null, tint = ExpenseRed)
                        budget.isNearLimit  -> Icon(Icons.Default.Warning, null, tint = WarningAmber)
                        budget.recurrence != BudgetRecurrence.NONE ->
                            Icon(Icons.Default.Repeat, null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        else -> Icon(Icons.Default.CheckCircle, null, tint = IncomeGreen)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // ── DESTACADO: Restante ─────────────────────────────────
            Column(horizontalAlignment = Alignment.CenterHorizontally,
                   modifier = Modifier.fillMaxWidth()) {
                val mainLabel = if (budget.isOverBudget) "Excedido" else "Te queda"
                Text(
                    mainLabel,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(2.dp))
                val mainAmount = if (budget.isOverBudget) budget.overspent else budget.remaining
                val prefix = if (budget.isOverBudget) "−" else ""
                Text(
                    "$prefix${CurrencyFormatter.format(mainAmount, currency)}",
                    style = MaterialTheme.typography.displaySmall.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 36.sp
                    ),
                    color = accentColor
                )
                if (budget.isActive && budget.daysRemaining > 0 && !budget.isOverBudget) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        "≈ ${CurrencyFormatter.format(budget.suggestedDailySpend, currency)} por día " +
                        "durante ${if (budget.daysRemaining == 1) "1 día" else "${budget.daysRemaining} días"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // ── Barra de progreso ────────────────────────────────────
            LinearProgressIndicator(
                progress = { budget.progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(10.dp)
                    .clip(RoundedCornerShape(6.dp)),
                color = accentColor,
                trackColor = MaterialTheme.colorScheme.surfaceVariant
            )

            Spacer(Modifier.height(8.dp))

            // ── Detalle: gastado / límite ────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "${CurrencyFormatter.format(budget.netSpent, currency)} de ${CurrencyFormatter.format(budget.amount, currency)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    "${(budget.progress * 100).toInt()}%",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Desglose si reduceByIncome está activo y hubo ingresos
            if (budget.reduceByIncome && budget.income > 0) {
                Spacer(Modifier.height(4.dp))
                Text(
                    "Gasto bruto ${CurrencyFormatter.format(budget.spent, currency)} − ingresos ${CurrencyFormatter.format(budget.income, currency)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = IncomeGreen
                )
            }

            Spacer(Modifier.height(12.dp))

            // ── Chips de contexto al final ───────────────────────────
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (budget.recurrence != BudgetRecurrence.NONE) {
                    ContextChip(budget.recurrence.label)
                }
                ContextChip(
                    if (budget.categoryIds.isEmpty()) "Todos los gastos"
                    else "${budget.categoryIds.size} categoría${if (budget.categoryIds.size > 1) "s" else ""}"
                )
                ContextChip(
                    if (budget.accountIds.isEmpty()) "Todas las cuentas"
                    else "${budget.accountIds.size} cuenta${if (budget.accountIds.size > 1) "s" else ""}"
                )
            }
        }
    }
}

@Composable
private fun ContextChip(label: String) {
    androidx.compose.material3.SuggestionChip(
        onClick = {},
        label = { Text(label, style = MaterialTheme.typography.labelSmall) }
    )
}
