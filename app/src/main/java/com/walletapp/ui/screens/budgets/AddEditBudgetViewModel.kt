package com.walletapp.ui.screens.budgets

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.domain.model.Account
import com.walletapp.domain.model.Budget
import com.walletapp.domain.model.BudgetPeriod
import com.walletapp.domain.model.BudgetRecurrence
import com.walletapp.domain.model.Category
import com.walletapp.domain.model.TransactionType
import com.walletapp.domain.repository.AccountRepository
import com.walletapp.domain.repository.BudgetRepository
import com.walletapp.domain.repository.CategoryRepository
import com.walletapp.util.DateUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import java.util.Calendar
import java.util.concurrent.TimeUnit
import javax.inject.Inject

data class AddEditBudgetState(
    val id: Long = 0,
    val name: String = "",
    val amount: String = "",
    /** Por defecto: hoy a las 00:00 */
    val startDate: Long = DateUtils.startOfDay(System.currentTimeMillis()),
    /** Por defecto: fin del mes actual (solo se usa cuando recurrence == NONE) */
    val endDate: Long = run {
        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, 23)
        cal.set(Calendar.MINUTE, 59)
        cal.set(Calendar.SECOND, 59)
        cal.set(Calendar.MILLISECOND, 999)
        cal.set(Calendar.DAY_OF_MONTH, cal.getActualMaximum(Calendar.DAY_OF_MONTH))
        cal.timeInMillis
    },
    val recurrence: BudgetRecurrence = BudgetRecurrence.MONTHLY,
    val expenseCategories: List<Category> = emptyList(),
    val selectedCategoryIds: Set<Long> = emptySet(),   // vacío = todas
    val accounts: List<Account> = emptyList(),
    val selectedAccountIds: Set<Long> = emptySet(),    // vacío = todas
    val reduceByIncome: Boolean = false,
    val saved: Boolean = false,
    val error: String? = null
) {
    /** Vista previa del período actual según la recurrencia y startDate. */
    val previewPeriod: Pair<Long, Long>
        get() = BudgetPeriod.currentPeriod(startDate, endDate, recurrence)
}

@HiltViewModel
class AddEditBudgetViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository,
    private val accountRepository: AccountRepository
) : ViewModel() {

    private val _state = MutableStateFlow(AddEditBudgetState())
    val state: StateFlow<AddEditBudgetState> = _state.asStateFlow()

    private val budgetId: Long = savedStateHandle.get<Long>("id") ?: -1L

    init {
        categoryRepository.observeByType(TransactionType.EXPENSE).onEach { cats ->
            _state.value = _state.value.copy(expenseCategories = cats)
        }.launchIn(viewModelScope)

        accountRepository.observeAccounts().onEach { accs ->
            _state.value = _state.value.copy(accounts = accs)
        }.launchIn(viewModelScope)

        if (budgetId > 0) {
            viewModelScope.launch {
                budgetRepository.getById(budgetId)?.let { b ->
                    _state.value = _state.value.copy(
                        id = b.id,
                        name = b.name,
                        amount = formatAmountInput(b.amount),
                        startDate = b.startDate,
                        endDate = b.endDate,
                        recurrence = b.recurrence,
                        selectedCategoryIds = b.categoryIds.toSet(),
                        selectedAccountIds = b.accountIds.toSet(),
                        reduceByIncome = b.reduceByIncome
                    )
                }
            }
        }
    }

    fun setName(v: String) { _state.value = _state.value.copy(name = v, error = null) }
    fun setAmount(v: String) { _state.value = _state.value.copy(amount = v, error = null) }

    fun setStartDate(millis: Long) {
        val start = DateUtils.startOfDay(millis)
        val current = _state.value
        val end = when (current.recurrence) {
            BudgetRecurrence.NONE ->
                if (current.endDate < start) DateUtils.endOfDay(start) else current.endDate
            else -> defaultEndForRecurrence(start, current.recurrence)
        }
        _state.value = current.copy(startDate = start, endDate = end, error = null)
    }

    fun setEndDate(millis: Long) {
        _state.value = _state.value.copy(endDate = DateUtils.endOfDay(millis), error = null)
    }

    fun setRecurrence(r: BudgetRecurrence) {
        val current = _state.value
        val newEnd = when (r) {
            BudgetRecurrence.NONE ->
                if (current.endDate < current.startDate) DateUtils.endOfDay(current.startDate)
                else current.endDate
            else -> defaultEndForRecurrence(current.startDate, r)
        }
        _state.value = current.copy(recurrence = r, endDate = newEnd, error = null)
    }

    private fun defaultEndForRecurrence(start: Long, r: BudgetRecurrence): Long = when (r) {
        BudgetRecurrence.WEEKLY -> start + TimeUnit.DAYS.toMillis(7) - 1L
        BudgetRecurrence.BIWEEKLY -> start + TimeUnit.DAYS.toMillis(14) - 1L
        BudgetRecurrence.MONTHLY -> Calendar.getInstance().apply {
            timeInMillis = start
            add(Calendar.MONTH, 1)
            add(Calendar.MILLISECOND, -1)
        }.timeInMillis
        BudgetRecurrence.NONE -> DateUtils.endOfDay(start)
    }

    fun toggleCategory(id: Long) {
        val current = _state.value.selectedCategoryIds.toMutableSet()
        if (!current.remove(id)) current.add(id)
        _state.value = _state.value.copy(selectedCategoryIds = current)
    }
    fun selectAllCategories() { _state.value = _state.value.copy(selectedCategoryIds = emptySet()) }

    fun toggleAccount(id: Long) {
        val current = _state.value.selectedAccountIds.toMutableSet()
        if (!current.remove(id)) current.add(id)
        _state.value = _state.value.copy(selectedAccountIds = current)
    }
    fun selectAllAccounts() { _state.value = _state.value.copy(selectedAccountIds = emptySet()) }

    fun setReduceByIncome(v: Boolean) { _state.value = _state.value.copy(reduceByIncome = v) }

    fun save() {
        val s = _state.value
        val amount = s.amount.replace(",", ".").toDoubleOrNull()
        when {
            s.name.isBlank() -> { _state.value = s.copy(error = "El nombre es obligatorio"); return }
            amount == null || amount <= 0 -> { _state.value = s.copy(error = "Monto inválido"); return }
            s.recurrence == BudgetRecurrence.NONE && s.endDate < s.startDate ->
                { _state.value = s.copy(error = "La fecha de fin debe ser posterior al inicio"); return }
        }
        viewModelScope.launch {
            val budget = Budget(
                id = s.id,
                name = s.name.trim(),
                amount = amount!!,
                startDate = s.startDate,
                endDate = s.endDate,
                recurrence = s.recurrence,
                categoryIds = s.selectedCategoryIds.toList(),
                accountIds = s.selectedAccountIds.toList(),
                reduceByIncome = s.reduceByIncome
            )
            budgetRepository.upsert(budget)
            _state.value = _state.value.copy(saved = true, error = null)
        }
    }

    fun delete() {
        val s = _state.value
        if (s.id == 0L) return
        viewModelScope.launch {
            budgetRepository.getById(s.id)?.let { budgetRepository.delete(it) }
            _state.value = _state.value.copy(saved = true)
        }
    }

    private fun formatAmountInput(value: Double): String {
        // Evita "1500.0" como texto inicial; muestra entero si no hay decimales.
        return if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()
    }
}
