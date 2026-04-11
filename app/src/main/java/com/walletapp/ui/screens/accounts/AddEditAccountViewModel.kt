package com.walletapp.ui.screens.accounts

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.domain.model.Account
import com.walletapp.domain.model.AccountType
import com.walletapp.domain.repository.AccountRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AddEditAccountState(
    val id: Long = 0,
    val name: String = "",
    val type: AccountType = AccountType.CASH,
    val initialBalance: String = "0",
    val colorHex: String = "#4CAF50",
    val iconName: String = "Payments",
    val includeInTotal: Boolean = true,
    val saved: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class AddEditAccountViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val accountRepository: AccountRepository
) : ViewModel() {

    private val _state = MutableStateFlow(AddEditAccountState())
    val state: StateFlow<AddEditAccountState> = _state.asStateFlow()

    private val accountId: Long = savedStateHandle.get<Long>("id") ?: -1L

    init {
        if (accountId > 0) {
            viewModelScope.launch {
                accountRepository.getAccountById(accountId)?.let { a ->
                    _state.value = AddEditAccountState(
                        id = a.id,
                        name = a.name,
                        type = a.type,
                        initialBalance = a.initialBalance.toString(),
                        colorHex = a.colorHex,
                        iconName = a.iconName,
                        includeInTotal = a.includeInTotal
                    )
                }
            }
        }
    }

    fun setName(name: String) { _state.value = _state.value.copy(name = name) }
    fun setType(type: AccountType) {
        _state.value = _state.value.copy(
            type = type,
            iconName = when (type) {
                AccountType.CASH -> "Payments"
                AccountType.BANK -> "AccountBalance"
                AccountType.CREDIT_CARD -> "CreditCard"
            }
        )
    }
    fun setBalance(v: String) { _state.value = _state.value.copy(initialBalance = v) }
    fun setColor(hex: String) { _state.value = _state.value.copy(colorHex = hex) }
    fun setIcon(name: String) { _state.value = _state.value.copy(iconName = name) }
    fun setIncludeInTotal(value: Boolean) { _state.value = _state.value.copy(includeInTotal = value) }

    fun save() {
        val s = _state.value
        if (s.name.isBlank()) {
            _state.value = s.copy(error = "Nombre requerido")
            return
        }
        val balance = s.initialBalance.toDoubleOrNull()
        if (balance == null) {
            _state.value = s.copy(error = "Balance inválido")
            return
        }
        viewModelScope.launch {
            val account = Account(
                id = s.id,
                name = s.name,
                type = s.type,
                initialBalance = balance,
                colorHex = s.colorHex,
                iconName = s.iconName,
                includeInTotal = s.includeInTotal
            )
            accountRepository.upsert(account)
            _state.value = _state.value.copy(saved = true, error = null)
        }
    }

    fun delete() {
        val s = _state.value
        if (s.id == 0L) return
        viewModelScope.launch {
            accountRepository.getAccountById(s.id)?.let { accountRepository.delete(it) }
            _state.value = _state.value.copy(saved = true)
        }
    }
}
