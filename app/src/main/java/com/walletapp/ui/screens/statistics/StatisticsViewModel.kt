package com.walletapp.ui.screens.statistics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.data.local.dao.CategorySum
import com.walletapp.data.local.dao.DailySum
import com.walletapp.data.preferences.SettingsDataStore
import com.walletapp.domain.model.Category
import com.walletapp.domain.repository.CategoryRepository
import com.walletapp.domain.repository.TransactionRepository
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
import java.util.Calendar
import javax.inject.Inject

data class StatisticsState(
    val expenseByCategory: List<CategorySum> = emptyList(),
    val categories: List<Category> = emptyList(),
    val monthlyTrend: List<Pair<String, Double>> = emptyList(),
    val dailyExpense: List<DailySum> = emptyList(),
    val year: Int = 0,
    val month: Int = 0,
    val monthLabel: String = "",
    val currency: String = "USD",
    val totalExpense: Double = 0.0
)

@HiltViewModel
class StatisticsViewModel @Inject constructor(
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
    private val settings: SettingsDataStore
) : ViewModel() {

    private val _state = MutableStateFlow(StatisticsState())
    val state: StateFlow<StatisticsState> = _state.asStateFlow()

    private val monthFlow = MutableStateFlow(DateUtils.currentMonth())

    @OptIn(ExperimentalCoroutinesApi::class)
    private val expenseFlow = monthFlow.flatMapLatest { (y, m) ->
        val (from, to) = DateUtils.monthRange(y, m)
        transactionRepository.observeExpenseByCategoryInRange(from, to)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private val dailyFlow = monthFlow.flatMapLatest { (y, m) ->
        val (from, to) = DateUtils.monthRange(y, m)
        transactionRepository.observeDailyExpenseInRange(from, to)
    }

    init {
        val combinedStats = combine(
            monthFlow,
            expenseFlow,
            dailyFlow
        ) { month, expenses, daily -> Triple(month, expenses, daily) }

        combine(
            combinedStats,
            categoryRepository.observeAll(),
            settings.currency
        ) { triple, cats, currency ->
            val (month, expenses, daily) = triple
            val (y, m) = month
            StatisticsState(
                expenseByCategory = expenses,
                categories = cats,
                dailyExpense = daily,
                year = y,
                month = m,
                monthLabel = DateUtils.yearMonthLabel(y, m),
                currency = currency,
                totalExpense = expenses.sumOf { it.total }
            )
        }.onEach { _state.value = it }.launchIn(viewModelScope)

        // Build monthly trend (last 6 months)
        launch6MonthTrend()
    }

    private fun launch6MonthTrend() {
        val (curYear, curMonth) = DateUtils.currentMonth()
        val months = (0 until 6).map { DateUtils.addMonths(curYear, curMonth, -(5 - it)) }
        val flows = months.map { (y, m) ->
            val (from, to) = DateUtils.monthRange(y, m)
            transactionRepository.observeExpenseInRange(from, to)
        }
        combine(flows) { values ->
            months.mapIndexed { i, pair ->
                val cal = Calendar.getInstance().apply { set(pair.first, pair.second - 1, 1) }
                val label = java.text.SimpleDateFormat("MMM", java.util.Locale.getDefault())
                    .format(cal.time)
                label to values[i]
            }
        }.onEach { trend ->
            _state.value = _state.value.copy(monthlyTrend = trend)
        }.launchIn(viewModelScope)
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
