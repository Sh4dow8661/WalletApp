package com.walletapp.ui.screens.transactions

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.walletapp.domain.model.TransactionType
import com.walletapp.ui.components.CategoryIconCircle
import com.walletapp.ui.theme.ExpenseRed
import com.walletapp.ui.theme.IncomeGreen
import com.walletapp.ui.theme.TransferBlue
import com.walletapp.util.DateUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddEditTransactionScreen(
    onBack: () -> Unit,
    viewModel: AddEditTransactionViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.saved) {
        if (state.saved) onBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (state.id == 0L) "Nueva transacción" else "Editar") },
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
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Type selector
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TypeChip("Gasto", state.type == TransactionType.EXPENSE, ExpenseRed) {
                    viewModel.setType(TransactionType.EXPENSE)
                }
                TypeChip("Ingreso", state.type == TransactionType.INCOME, IncomeGreen) {
                    viewModel.setType(TransactionType.INCOME)
                }
                TypeChip("Transferencia", state.type == TransactionType.TRANSFER, TransferBlue) {
                    viewModel.setType(TransactionType.TRANSFER)
                }
            }

            OutlinedTextField(
                value = state.amount,
                onValueChange = { v ->
                    if (v.isEmpty() || v.toDoubleOrNull() != null) viewModel.setAmount(v)
                },
                label = { Text("Monto") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            // Accounts
            Text("Cuenta", style = MaterialTheme.typography.titleMedium)
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                state.accounts.forEach { account ->
                    FilterChip(
                        selected = state.accountId == account.id,
                        onClick = { viewModel.setAccount(account.id) },
                        label = { Text(account.name) }
                    )
                }
            }

            if (state.type == TransactionType.TRANSFER) {
                Text("Cuenta destino", style = MaterialTheme.typography.titleMedium)
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    state.accounts.filter { it.id != state.accountId }.forEach { account ->
                        FilterChip(
                            selected = state.transferAccountId == account.id,
                            onClick = { viewModel.setTransferAccount(account.id) },
                            label = { Text(account.name) }
                        )
                    }
                }
            } else {
                Text("Categoría", style = MaterialTheme.typography.titleMedium)
                val filteredCats = state.categories.filter { it.type == state.type }
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    filteredCats.forEach { cat ->
                        FilterChip(
                            selected = state.categoryId == cat.id,
                            onClick = { viewModel.setCategory(cat.id) },
                            label = {
                                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                    CategoryIconCircle(
                                        iconName = cat.iconName,
                                        colorHex = cat.colorHex,
                                        size = 24
                                    )
                                    Spacer(Modifier.padding(horizontal = 4.dp))
                                    Text(cat.name)
                                }
                            }
                        )
                    }
                }
            }

            // Presupuestos (gasto resta, ingreso suma; las transferencias no aplican)
            if (state.type != TransactionType.TRANSFER && state.budgets.isNotEmpty()) {
                Text("Aplicar a presupuestos", style = MaterialTheme.typography.titleMedium)
                Text(
                    if (state.type == TransactionType.EXPENSE)
                        "Selecciona a qué presupuestos se le resta este gasto"
                    else
                        "Selecciona a qué presupuestos se le suma este ingreso (libera dinero restante)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    state.budgets.forEach { budget ->
                        FilterChip(
                            selected = budget.id in state.selectedBudgetIds,
                            onClick = { viewModel.toggleBudget(budget.id) },
                            label = { Text(budget.name) }
                        )
                    }
                }
            }

            OutlinedTextField(
                value = state.note,
                onValueChange = viewModel::setNote,
                label = { Text("Nota") },
                modifier = Modifier.fillMaxWidth()
            )

            DateSelector(
                date = state.date,
                onDateChange = viewModel::setDate
            )

            state.error?.let { error ->
                Text(error, color = MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = { viewModel.save() },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Guardar")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TypeChip(
    label: String,
    selected: Boolean,
    color: androidx.compose.ui.graphics.Color,
    onClick: () -> Unit
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        colors = androidx.compose.material3.FilterChipDefaults.filterChipColors(
            selectedContainerColor = color.copy(alpha = 0.2f),
            selectedLabelColor = color
        )
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateSelector(date: Long, onDateChange: (Long) -> Unit) {
    var showDialog by remember { mutableStateOf(false) }
    androidx.compose.material3.OutlinedButton(
        onClick = { showDialog = true },
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(DateUtils.formatDate(date))
    }
    if (showDialog) {
        val datePickerState = androidx.compose.material3.rememberDatePickerState(
            initialSelectedDateMillis = DateUtils.localMillisToPickerMillis(date)
        )
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = { showDialog = false },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let {
                        onDateChange(DateUtils.pickerMillisToLocalStartOfDay(it))
                    }
                    showDialog = false
                }) { Text("OK") }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { showDialog = false }) {
                    Text("Cancelar")
                }
            }
        ) {
            androidx.compose.material3.DatePicker(state = datePickerState)
        }
    }
}
