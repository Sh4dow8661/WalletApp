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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.walletapp.domain.model.Budget
import com.walletapp.domain.model.BudgetRecurrence
import com.walletapp.ui.theme.ExpenseRed
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
                    "Crea un presupuesto con rango de fechas y elige qué gastos y cuentas rastrear",
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
                        "${DateUtils.formatDate(budget.startDate)} → ${DateUtils.formatDate(budget.endDate)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                // Icono de alerta / recurrencia
                Box {
                    when {
                        budget.isOverBudget -> Icon(Icons.Default.Warning, null, tint = ExpenseRed)
                        budget.isNearLimit  -> Icon(Icons.Default.Warning, null, tint = WarningAmber)
                        budget.recurrence != BudgetRecurrence.NONE ->
                            Icon(Icons.Default.Repeat, null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            Spacer(Modifier.height(4.dp))

            // ── Chips de contexto ────────────────────────────────────
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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

            Spacer(Modifier.height(12.dp))

            // ── Montos ───────────────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "Gastado: ${CurrencyFormatter.format(budget.spent, currency)}",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    "de ${CurrencyFormatter.format(budget.effectiveAmount, currency)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Nota de reducción por ingreso
            if (budget.reduceByIncome && budget.income > 0) {
                Text(
                    "Ingresos del período: −${CurrencyFormatter.format(budget.income, currency)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            Spacer(Modifier.height(8.dp))

            // ── Barra de progreso ────────────────────────────────────
            LinearProgressIndicator(
                progress = { budget.progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp),
                color = when {
                    budget.isOverBudget -> ExpenseRed
                    budget.isNearLimit  -> WarningAmber
                    else                -> MaterialTheme.colorScheme.primary
                },
                trackColor = MaterialTheme.colorScheme.surfaceVariant
            )

            Spacer(Modifier.height(4.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("${(budget.progress * 100).toInt()}%",
                    style = MaterialTheme.typography.labelSmall)
                val label = when {
                    budget.isOverBudget -> "Excedido en ${CurrencyFormatter.format(budget.spent - budget.effectiveAmount, currency)}"
                    else -> "Restante: ${CurrencyFormatter.format(budget.remaining, currency)}"
                }
                Text(
                    label,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (budget.isOverBudget) ExpenseRed
                            else MaterialTheme.colorScheme.onSurfaceVariant
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
