package com.walletapp.ui.screens.budgets

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.domain.model.Budget
import com.walletapp.domain.model.Category
import com.walletapp.domain.model.TransactionType
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
import javax.inject.Inject

data class AddEditBudgetState(
    val id: Long = 0,
    val categoryId: Long? = null,
    val amount: String = "",
    val year: Int = 0,
    val month: Int = 0,
    val categories: List<Category> = emptyList(),
    val saved: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class AddEditBudgetViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository
) : ViewModel() {

    private val _state = MutableStateFlow(
        DateUtils.currentMonth().let { (y, m) -> AddEditBudgetState(year = y, month = m) }
    )
    val state: StateFlow<AddEditBudgetState> = _state.asStateFlow()

    private val budgetId: Long = savedStateHandle.get<Long>("id") ?: -1L

    init {
        categoryRepository.observeByType(TransactionType.EXPENSE).onEach { cats ->
            _state.value = _state.value.copy(categories = cats)
        }.launchIn(viewModelScope)

        if (budgetId > 0) {
            viewModelScope.launch {
                budgetRepository.getById(budgetId)?.let { b ->
                    _state.value = _state.value.copy(
                        id = b.id,
                        categoryId = b.categoryId,
                        amount = b.amount.toString(),
                        year = b.year,
                        month = b.month
                    )
                }
            }
        }
    }

    fun setCategory(id: Long?) { _state.value = _state.value.copy(categoryId = id) }
    fun setAmount(v: String) { _state.value = _state.value.copy(amount = v) }

    fun save() {
        val s = _state.value
        val amount = s.amount.toDoubleOrNull()
        if (amount == null || amount <= 0) {
            _state.value = s.copy(error = "Monto inválido")
            return
        }
        if (s.categoryId == null) {
            _state.value = s.copy(error = "Selecciona una categoría")
            return
        }
        viewModelScope.launch {
            val budget = Budget(
                id = s.id,
                categoryId = s.categoryId,
                amount = amount,
                year = s.year,
                month = s.month
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
}
