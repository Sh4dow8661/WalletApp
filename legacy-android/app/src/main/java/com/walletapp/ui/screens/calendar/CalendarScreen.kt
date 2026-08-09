package com.walletapp.ui.screens.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Card
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
import com.walletapp.ui.theme.ExpenseRed
import com.walletapp.util.CurrencyFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarScreen(
    onBack: () -> Unit,
    viewModel: CalendarViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val maxExpense = state.days.maxOfOrNull { it.expense } ?: 0.0

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
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Atrás")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)
        ) {
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        "Gasto total del mes",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        CurrencyFormatter.format(state.totalExpense, state.currency),
                        style = MaterialTheme.typography.headlineMedium,
                        color = ExpenseRed
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                listOf("L", "M", "M", "J", "V", "S", "D").forEach { label ->
                    Text(
                        label,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            LazyVerticalGrid(
                columns = GridCells.Fixed(7),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                items(state.days) { day ->
                    CalendarCell(day, state.currency, maxExpense)
                }
            }
        }
    }
}

@Composable
private fun CalendarCell(day: CalendarDay, currency: String, maxExpense: Double) {
    if (!day.inCurrentMonth) {
        Box(modifier = Modifier.size(48.dp))
        return
    }
    val intensity = if (maxExpense > 0) (day.expense / maxExpense).toFloat() else 0f
    val bg = ExpenseRed.copy(alpha = intensity.coerceIn(0f, 1f) * 0.4f + if (day.expense > 0) 0.1f else 0f)
    Box(
        modifier = Modifier
            .size(48.dp)
            .background(
                color = if (day.expense > 0) bg else Color.Transparent,
                shape = RoundedCornerShape(8.dp)
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                day.day.toString(),
                style = MaterialTheme.typography.bodyMedium
            )
            if (day.expense > 0) {
                Text(
                    text = shortFormat(day.expense),
                    style = MaterialTheme.typography.labelSmall,
                    color = ExpenseRed
                )
            }
        }
    }
}

private fun shortFormat(value: Double): String {
    return when {
        value >= 1000 -> "${(value / 1000).toInt()}k"
        else -> value.toInt().toString()
    }
}
