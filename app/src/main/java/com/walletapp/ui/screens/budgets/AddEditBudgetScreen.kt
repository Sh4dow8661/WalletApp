package com.walletapp.ui.screens.budgets

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.walletapp.domain.model.BudgetRecurrence
import com.walletapp.ui.components.CategoryIconCircle
import com.walletapp.util.DateUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddEditBudgetScreen(
    onBack: () -> Unit,
    viewModel: AddEditBudgetViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(state.saved) { if (state.saved) onBack() }

    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker   by remember { mutableStateOf(false) }

    val startPickerState = rememberDatePickerState(initialSelectedDateMillis = state.startDate)
    val endPickerState   = rememberDatePickerState(initialSelectedDateMillis = state.endDate)

    LaunchedEffect(state.startDate) { startPickerState.selectedDateMillis = state.startDate }
    LaunchedEffect(state.endDate)   { endPickerState.selectedDateMillis   = state.endDate   }

    if (showStartPicker) {
        DatePickerDialog(
            onDismissRequest = { showStartPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    startPickerState.selectedDateMillis?.let { viewModel.setStartDate(it) }
                    showStartPicker = false
                }) { Text("Aceptar") }
            },
            dismissButton = {
                TextButton(onClick = { showStartPicker = false }) { Text("Cancelar") }
            }
        ) { DatePicker(state = startPickerState) }
    }

    if (showEndPicker) {
        DatePickerDialog(
            onDismissRequest = { showEndPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    endPickerState.selectedDateMillis?.let { viewModel.setEndDate(it) }
                    showEndPicker = false
                }) { Text("Aceptar") }
            },
            dismissButton = {
                TextButton(onClick = { showEndPicker = false }) { Text("Cancelar") }
            }
        ) { DatePicker(state = endPickerState) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (state.id == 0L) "Nuevo presupuesto" else "Editar presupuesto") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Atrás")
                    }
                },
                actions = {
                    if (state.id != 0L) {
                        IconButton(onClick = { viewModel.delete() }) {
                            Icon(Icons.Default.Delete, contentDescription = "Eliminar")
                        }
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {

            // ── Nombre ───────────────────────────────────────────────
            OutlinedTextField(
                value = state.name,
                onValueChange = viewModel::setName,
                label = { Text("Nombre del presupuesto") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            // ── Monto ────────────────────────────────────────────────
            OutlinedTextField(
                value = state.amount,
                onValueChange = { v -> if (v.isEmpty() || v.replace(",", ".").toDoubleOrNull() != null) viewModel.setAmount(v) },
                label = { Text("Monto límite por período") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal)
            )

            // ── Recurrencia ───────────────────────────────────────────
            SectionLabel("Período")
            Text(
                "Define cada cuánto se reinicia el presupuesto",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                BudgetRecurrence.entries.forEach { rec ->
                    FilterChip(
                        selected = state.recurrence == rec,
                        onClick = { viewModel.setRecurrence(rec) },
                        label = { Text(rec.label) }
                    )
                }
            }

            // ── Fechas según el modo ──────────────────────────────────
            if (state.recurrence == BudgetRecurrence.NONE) {
                SectionLabel("Rango de fechas")
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    DateCard(
                        label = "Inicio",
                        date = DateUtils.formatDate(state.startDate),
                        modifier = Modifier.weight(1f),
                        onClick = { showStartPicker = true }
                    )
                    DateCard(
                        label = "Fin",
                        date = DateUtils.formatDate(state.endDate),
                        modifier = Modifier.weight(1f),
                        onClick = { showEndPicker = true }
                    )
                }
            } else {
                SectionLabel("Inicio del primer período")
                Text(
                    "Define el día de corte. El presupuesto se renovará automáticamente cada ${state.recurrence.label.lowercase()}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                DateCard(
                    label = "Fecha de inicio",
                    date = DateUtils.formatDate(state.startDate),
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { showStartPicker = true }
                )

                // Vista previa del período actual
                val (prevStart, prevEnd) = state.previewPeriod
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Repeat,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(
                                "Período actual",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                            Text(
                                "${DateUtils.formatDate(prevStart)} → ${DateUtils.formatDate(prevEnd)}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }
                }
            }

            HorizontalDivider()

            // ── Categorías de gasto ───────────────────────────────────
            SectionLabel("Categorías de gasto")
            Text(
                "Selecciona qué gastos cuentan para este presupuesto",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = state.selectedCategoryIds.isEmpty(),
                    onClick = { viewModel.selectAllCategories() },
                    label = { Text("Todas") }
                )
                state.expenseCategories.forEach { cat ->
                    FilterChip(
                        selected = cat.id in state.selectedCategoryIds,
                        onClick = { viewModel.toggleCategory(cat.id) },
                        label = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                CategoryIconCircle(cat.iconName, cat.colorHex, size = 20)
                                Spacer(Modifier.width(6.dp))
                                Text(cat.name)
                            }
                        }
                    )
                }
            }

            HorizontalDivider()

            // ── Cuentas ───────────────────────────────────────────────
            SectionLabel("Cuentas")
            Text(
                "Selecciona de qué cuentas se rastrean los gastos",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = state.selectedAccountIds.isEmpty(),
                    onClick = { viewModel.selectAllAccounts() },
                    label = { Text("Todas") }
                )
                state.accounts.forEach { acc ->
                    FilterChip(
                        selected = acc.id in state.selectedAccountIds,
                        onClick = { viewModel.toggleAccount(acc.id) },
                        label = { Text(acc.name) }
                    )
                }
            }

            HorizontalDivider()

            // ── Restar ingresos del gasto ─────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Restar ingresos del gasto", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "Los ingresos del período cuentan como reembolsos: aumentan tu dinero restante",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(Modifier.width(16.dp))
                Switch(
                    checked = state.reduceByIncome,
                    onCheckedChange = viewModel::setReduceByIncome
                )
            }

            // ── Error ─────────────────────────────────────────────────
            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            // ── Guardar ───────────────────────────────────────────────
            Button(
                onClick = { viewModel.save() },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Guardar presupuesto")
            }

            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
}

@Composable
private fun DateCard(
    label: String,
    date: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Card(
        modifier = modifier.clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                Icons.Default.CalendarMonth,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.height(4.dp))
            Text(label, style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(date, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
