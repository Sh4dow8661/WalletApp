package com.walletapp.ui.screens.transactions

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.domain.model.Account
import com.walletapp.domain.model.Category
import com.walletapp.domain.model.Transaction
import com.walletapp.domain.model.TransactionType
import com.walletapp.domain.repository.AccountRepository
import com.walletapp.domain.repository.CategoryRepository
import com.walletapp.domain.repository.TransactionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AddEditTransactionState(
    val id: Long = 0,
    val amount: String = "",
    val type: TransactionType = TransactionType.EXPENSE,
    val categoryId: Long? = null,
    val accountId: Long? = null,
    val transferAccountId: Long? = null,
    val note: String = "",
    val date: Long = System.currentTimeMillis(),
    val categories: List<Category> = emptyList(),
    val accounts: List<Account> = emptyList(),
    val saved: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class AddEditTransactionViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
    private val accountRepository: AccountRepository
) : ViewModel() {

    private val _state = MutableStateFlow(AddEditTransactionState())
    val state: StateFlow<AddEditTransactionState> = _state.asStateFlow()

    private val transactionId: Long = savedStateHandle.get<Long>("id") ?: -1L

    init {
        combine(
            categoryRepository.observeAll(),
            accountRepository.observeAccounts()
        ) { cats, accs -> cats to accs }
            .onEach { (cats, accs) ->
                val current = _state.value
                _state.value = current.copy(
                    categories = cats,
                    accounts = accs,
                    accountId = current.accountId ?: accs.firstOrNull()?.id
                )
            }.launchIn(viewModelScope)

        if (transactionId > 0) {
            viewModelScope.launch {
                transactionRepository.getById(transactionId)?.let { tx ->
                    _state.value = _state.value.copy(
                        id = tx.id,
                        amount = tx.amount.toString(),
                        type = tx.type,
                        categoryId = tx.categoryId,
                        accountId = tx.accountId,
                        transferAccountId = tx.transferAccountId,
                        note = tx.note,
                        date = tx.date
                    )
                }
            }
        }
    }

    fun setAmount(amount: String) {
        _state.value = _state.value.copy(amount = amount)
    }

    fun setType(type: TransactionType) {
        _state.value = _state.value.copy(type = type, categoryId = null)
    }

    fun setCategory(id: Long?) { _state.value = _state.value.copy(categoryId = id) }
    fun setAccount(id: Long?) { _state.value = _state.value.copy(accountId = id) }
    fun setTransferAccount(id: Long?) { _state.value = _state.value.copy(transferAccountId = id) }
    fun setNote(note: String) { _state.value = _state.value.copy(note = note) }
    fun setDate(date: Long) { _state.value = _state.value.copy(date = date) }

    fun save() {
        val s = _state.value
        val amount = s.amount.toDoubleOrNull()
        if (amount == null || amount <= 0) {
            _state.value = s.copy(error = "Monto inválido")
            return
        }
        if (s.accountId == null) {
            _state.value = s.copy(error = "Selecciona una cuenta")
            return
        }
        if (s.type == TransactionType.TRANSFER) {
            if (s.transferAccountId == null || s.transferAccountId == s.accountId) {
                _state.value = s.copy(error = "Selecciona cuenta destino válida")
                return
            }
        } else if (s.categoryId == null) {
            _state.value = s.copy(error = "Selecciona una categoría")
            return
        }

        viewModelScope.launch {
            if (s.type == TransactionType.TRANSFER) {
                // Two linked transactions: expense in source, income in destination
                val sourceTx = Transaction(
                    id = s.id,
                    amount = amount,
                    type = TransactionType.TRANSFER,
                    categoryId = null,
                    accountId = s.accountId,
                    transferAccountId = s.transferAccountId,
                    note = s.note,
                    date = s.date,
                    isOutgoing = true
                )
                transactionRepository.upsert(sourceTx)
                val destTx = Transaction(
                    amount = amount,
                    type = TransactionType.TRANSFER,
                    categoryId = null,
                    accountId = s.transferAccountId!!,
                    transferAccountId = s.accountId,
                    note = s.note,
                    date = s.date,
                    isOutgoing = false
                )
                // Only insert dest if creating a new transfer
                if (s.id == 0L) transactionRepository.upsert(destTx)
            } else {
                val tx = Transaction(
                    id = s.id,
                    amount = amount,
                    type = s.type,
                    categoryId = s.categoryId,
                    accountId = s.accountId,
                    note = s.note,
                    date = s.date
                )
                transactionRepository.upsert(tx)
            }
            _state.value = _state.value.copy(saved = true, error = null)
        }
    }

    fun delete() {
        val s = _state.value
        if (s.id == 0L) return
        viewModelScope.launch {
            transactionRepository.getById(s.id)?.let {
                transactionRepository.delete(it)
            }
            _state.value = _state.value.copy(saved = true)
        }
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
