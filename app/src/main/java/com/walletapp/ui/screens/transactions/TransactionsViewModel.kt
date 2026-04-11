package com.walletapp.ui.screens.transactions

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
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import javax.inject.Inject

data class TransactionsState(
    val transactions: List<Transaction> = emptyList(),
    val categories: List<Category> = emptyList(),
    val accounts: List<Account> = emptyList(),
    val currency: String = "USD",
    val year: Int = 0,
    val month: Int = 0,
    val monthLabel: String = "",
    val filterCategoryId: Long? = null,
    val filterAccountId: Long? = null
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class TransactionsViewModel @Inject constructor(
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
    private val accountRepository: AccountRepository,
    private val settings: SettingsDataStore
) : ViewModel() {

    private val _state = MutableStateFlow(
        DateUtils.currentMonth().let { (y, m) ->
            TransactionsState(year = y, month = m, monthLabel = DateUtils.yearMonthLabel(y, m))
        }
    )
    val state: StateFlow<TransactionsState> = _state.asStateFlow()

    private val monthFlow = MutableStateFlow(DateUtils.currentMonth())
    private val categoryFilter = MutableStateFlow<Long?>(null)
    private val accountFilter = MutableStateFlow<Long?>(null)

    init {
        combine(monthFlow, categoryFilter, accountFilter) { month, catFilter, accFilter ->
            Triple(month, catFilter, accFilter)
        }.flatMapLatest { (month, catFilter, accFilter) ->
            val (y, m) = month
            val (from, to) = DateUtils.monthRange(y, m)
            combine(
                transactionRepository.observeInRange(from, to),
                categoryRepository.observeAll(),
                accountRepository.observeAccounts(),
                settings.currency
            ) { txs, cats, accs, currency ->
                val filtered = txs.filter { t ->
                    (catFilter == null || t.categoryId == catFilter) &&
                        (accFilter == null || t.accountId == accFilter)
                }
                TransactionsState(
                    transactions = filtered,
                    categories = cats,
                    accounts = accs,
                    currency = currency,
                    year = y,
                    month = m,
                    monthLabel = DateUtils.yearMonthLabel(y, m),
                    filterCategoryId = catFilter,
                    filterAccountId = accFilter
                )
            }
        }.onEach { _state.value = it }.launchIn(viewModelScope)
    }

    fun nextMonth() {
        val (y, m) = monthFlow.value
        monthFlow.value = DateUtils.addMonths(y, m, 1)
    }

    fun previousMonth() {
        val (y, m) = monthFlow.value
        monthFlow.value = DateUtils.addMonths(y, m, -1)
    }

    fun setCategoryFilter(id: Long?) { categoryFilter.value = id }
    fun setAccountFilter(id: Long?) { accountFilter.value = id }
}
