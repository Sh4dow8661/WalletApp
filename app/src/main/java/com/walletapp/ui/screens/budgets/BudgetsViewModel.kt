package com.walletapp.ui.screens.budgets

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.data.preferences.SettingsDataStore
import com.walletapp.domain.model.Budget
import com.walletapp.domain.repository.BudgetRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import javax.inject.Inject

data class BudgetsState(
    val budgets: List<Budget> = emptyList(),
    val currency: String = "USD"
)

@HiltViewModel
class BudgetsViewModel @Inject constructor(
    private val budgetRepository: BudgetRepository,
    private val settings: SettingsDataStore
) : ViewModel() {

    private val _state = MutableStateFlow(BudgetsState())
    val state: StateFlow<BudgetsState> = _state.asStateFlow()

    init {
        combine(
            budgetRepository.observeAll(),
            settings.currency
        ) { budgets, currency ->
            // Activos primero, luego por fecha de inicio descendente
            val sorted = budgets.sortedWith(
                compareByDescending<Budget> { it.isActive }.thenByDescending { it.startDate }
            )
            BudgetsState(budgets = sorted, currency = currency)
        }.onEach { _state.value = it }.launchIn(viewModelScope)
    }
}
