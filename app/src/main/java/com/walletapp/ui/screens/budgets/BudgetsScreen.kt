package com.walletapp.ui.screens.budgets

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import com.walletapp.domain.model.Category
import com.walletapp.ui.components.CategoryIconCircle
import com.walletapp.ui.theme.ExpenseRed
import com.walletapp.ui.theme.WarningAmber
import com.walletapp.util.CurrencyFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BudgetsScreen(
    onAddBudget: () -> Unit,
    onOpenBudget: (Long) -> Unit,
    viewModel: BudgetsViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = viewModel::previousMonth) {
                            Icon(Icons.Default.ChevronLeft, contentDescription = null)
                        }
                        Text(state.monthLabel)
                        IconButton(onClick = viewModel::nextMonth) {
                            Icon(Icons.Default.ChevronRight, contentDescription = null)
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onAddBudget) {
                Icon(Icons.Default.Add, contentDescription = "Nuevo presupuesto")
            }
        }
    ) { padding ->
        if (state.budgets.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    "Aún no hay presupuestos",
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Crea un presupuesto mensual por categoría para monitorear tus gastos",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(state.budgets) { budget ->
                    BudgetCard(
                        budget = budget,
                        category = state.categories.firstOrNull { it.id == budget.categoryId },
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
    category: Category?,
    currency: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CategoryIconCircle(
                    iconName = category?.iconName ?: "Category",
                    colorHex = category?.colorHex ?: "#78909C"
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        category?.name ?: "Categoría",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        "${CurrencyFormatter.format(budget.spent, currency)} de ${
                            CurrencyFormatter.format(budget.amount, currency)
                        }",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (budget.isOverBudget) {
                    Icon(
                        Icons.Default.Warning,
                        contentDescription = null,
                        tint = ExpenseRed
                    )
                } else if (budget.isNearLimit) {
                    Icon(
                        Icons.Default.Warning,
                        contentDescription = null,
                        tint = WarningAmber
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            LinearProgressIndicator(
                progress = { budget.progress },
                modifier = Modifier.fillMaxWidth().height(8.dp),
                color = when {
                    budget.isOverBudget -> ExpenseRed
                    budget.isNearLimit -> WarningAmber
                    else -> MaterialTheme.colorScheme.primary
                },
                trackColor = MaterialTheme.colorScheme.surfaceVariant
            )
            Spacer(Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "${(budget.progress * 100).toInt()}%",
                    style = MaterialTheme.typography.labelSmall
                )
                val remaining = budget.amount - budget.spent
                Text(
                    "Restante: ${CurrencyFormatter.format(remaining.coerceAtLeast(0.0), currency)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
