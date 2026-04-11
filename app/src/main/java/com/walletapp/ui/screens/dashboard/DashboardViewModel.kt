package com.walletapp.ui.screens.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.data.preferences.SettingsDataStore
import com.walletapp.domain.model.Account
import com.walletapp.domain.model.Category
import com.walletapp.domain.model.Transaction
import com.walletapp.domain.repository.AccountRepository
import com.walletapp.domain.repository.CategoryRepository
import com.walletapp.domain.repository.TransactionRepository
import com.walletapp.util.DateUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import javax.inject.Inject

data class DashboardState(
    val totalBalance: Double = 0.0,
    val monthIncome: Double = 0.0,
    val monthExpense: Double = 0.0,
    val accounts: List<Account> = emptyList(),
    val recentTransactions: List<Transaction> = emptyList(),
    val categories: List<Category> = emptyList(),
    val currency: String = "USD",
    val monthLabel: String = ""
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    accountRepository: AccountRepository,
    transactionRepository: TransactionRepository,
    categoryRepository: CategoryRepository,
    settings: SettingsDataStore
) : ViewModel() {

    private val _state = MutableStateFlow(DashboardState())
    val state: StateFlow<DashboardState> = _state.asStateFlow()

    init {
        val (year, month) = DateUtils.currentMonth()
        val (from, to) = DateUtils.monthRange(year, month)
        val monthLabel = DateUtils.yearMonthLabel(year, month)

        val summaryFlow = combine(
            transactionRepository.observeInRange(from, to),
            transactionRepository.observeIncomeInRange(from, to),
            transactionRepository.observeExpenseInRange(from, to)
        ) { txs, income, expense -> Triple(txs, income, expense) }

        combine(
            accountRepository.observeAccounts(),
            summaryFlow,
            categoryRepository.observeAll(),
            settings.currency
        ) { accounts, summary, cats, currency ->
            val (txs, income, expense) = summary
            DashboardState(
                totalBalance = accounts.filter { it.includeInTotal }.sumOf { it.currentBalance },
                monthIncome = income,
                monthExpense = expense,
                accounts = accounts,
                recentTransactions = txs.take(10),
                categories = cats,
                currency = currency,
                monthLabel = monthLabel
            )
        }.onEach { _state.value = it }.launchIn(viewModelScope)
    }
}
