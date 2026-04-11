package com.walletapp.ui.screens.budgets

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.data.preferences.SettingsDataStore
import com.walletapp.domain.model.Budget
import com.walletapp.domain.model.Category
import com.walletapp.domain.repository.BudgetRepository
import com.walletapp.domain.repository.CategoryRepository
import com.walletapp.util.DateUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import javax.inject.Inject

data class BudgetsState(
    val budgets: List<Budget> = emptyList(),
    val categories: List<Category> = emptyList(),
    val year: Int = 0,
    val month: Int = 0,
    val monthLabel: String = "",
    val currency: String = "USD"
)

@HiltViewModel
class BudgetsViewModel @Inject constructor(
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository,
    private val settings: SettingsDataStore
) : ViewModel() {

    private val _state = MutableStateFlow(BudgetsState())
    val state: StateFlow<BudgetsState> = _state.asStateFlow()

    private val monthFlow = MutableStateFlow(DateUtils.currentMonth())

    @OptIn(ExperimentalCoroutinesApi::class)
    val budgetsFlow = monthFlow.flatMapLatest { (y, m) ->
        budgetRepository.observeByMonth(y, m)
    }

    init {
        combine(
            monthFlow,
            budgetsFlow,
            categoryRepository.observeAll(),
            settings.currency
        ) { month, budgets, cats, currency ->
            val (y, m) = month
            BudgetsState(
                budgets = budgets,
                categories = cats,
                year = y,
                month = m,
                monthLabel = DateUtils.yearMonthLabel(y, m),
                currency = currency
            )
        }.onEach { _state.value = it }.launchIn(viewModelScope)
    }

    fun previousMonth() {
        val (y, m) = monthFlow.value
        monthFlow.value = DateUtils.addMonths(y, m, -1)
    }

    fun nextMonth() {
        val (y, m) = monthFlow.value
        monthFlow.value = DateUtils.addMonths(y, m, 1)
    }
}
