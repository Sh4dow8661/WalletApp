package com.walletapp.ui.screens.calendar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.data.preferences.SettingsDataStore
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

data class CalendarDay(
    val day: Int,
    val expense: Double,
    val inCurrentMonth: Boolean
)

data class CalendarState(
    val year: Int = 0,
    val month: Int = 0,
    val monthLabel: String = "",
    val currency: String = "USD",
    val days: List<CalendarDay> = emptyList(),
    val totalExpense: Double = 0.0
)

@HiltViewModel
class CalendarViewModel @Inject constructor(
    private val transactionRepository: TransactionRepository,
    private val settings: SettingsDataStore
) : ViewModel() {

    private val _state = MutableStateFlow(CalendarState())
    val state: StateFlow<CalendarState> = _state.asStateFlow()

    private val monthFlow = MutableStateFlow(DateUtils.currentMonth())

    @OptIn(ExperimentalCoroutinesApi::class)
    private val dailyFlow = monthFlow.flatMapLatest { (y, m) ->
        val (from, to) = DateUtils.monthRange(y, m)
        transactionRepository.observeDailyExpenseInRange(from, to)
    }

    init {
        combine(
            monthFlow,
            dailyFlow,
            settings.currency
        ) { month, daily, currency ->
            val (y, m) = month
            val days = buildCalendarDays(y, m, daily.associate { entry ->
                val cal = Calendar.getInstance().apply { timeInMillis = entry.day }
                cal.get(Calendar.DAY_OF_MONTH) to entry.total
            })
            CalendarState(
                year = y,
                month = m,
                monthLabel = DateUtils.yearMonthLabel(y, m),
                currency = currency,
                days = days,
                totalExpense = daily.sumOf { it.total }
            )
        }.onEach { _state.value = it }.launchIn(viewModelScope)
    }

    private fun buildCalendarDays(
        year: Int,
        month: Int,
        expenseByDay: Map<Int, Double>
    ): List<CalendarDay> {
        val daysInMonth = DateUtils.daysInMonth(year, month)
        val firstWeekday = DateUtils.firstDayOfWeekOfMonth(year, month)
        val result = mutableListOf<CalendarDay>()
        repeat(firstWeekday) { result.add(CalendarDay(0, 0.0, inCurrentMonth = false)) }
        for (d in 1..daysInMonth) {
            result.add(CalendarDay(d, expenseByDay[d] ?: 0.0, inCurrentMonth = true))
        }
        while (result.size % 7 != 0) {
            result.add(CalendarDay(0, 0.0, inCurrentMonth = false))
        }
        return result
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
