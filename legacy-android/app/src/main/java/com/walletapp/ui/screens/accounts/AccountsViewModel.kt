package com.walletapp.ui.screens.accounts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.data.preferences.SettingsDataStore
import com.walletapp.domain.model.Account
import com.walletapp.domain.repository.AccountRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import javax.inject.Inject

data class AccountsState(
    val accounts: List<Account> = emptyList(),
    val currency: String = "USD"
)

@HiltViewModel
class AccountsViewModel @Inject constructor(
    accountRepository: AccountRepository,
    settings: SettingsDataStore
) : ViewModel() {

    private val _state = MutableStateFlow(AccountsState())
    val state: StateFlow<AccountsState> = _state.asStateFlow()

    init {
        combine(
            accountRepository.observeAccounts(),
            settings.currency
        ) { accounts, currency ->
            AccountsState(accounts = accounts, currency = currency)
        }.onEach { _state.value = it }.launchIn(viewModelScope)
    }
}
