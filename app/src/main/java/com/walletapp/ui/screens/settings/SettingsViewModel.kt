package com.walletapp.ui.screens.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.data.preferences.SettingsDataStore
import com.walletapp.domain.repository.AccountRepository
import com.walletapp.domain.repository.CategoryRepository
import com.walletapp.domain.repository.TransactionRepository
import com.walletapp.ui.theme.ThemeMode
import com.walletapp.util.CsvExporter
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsState(
    val currency: String = "USD",
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val exportMessage: String? = null
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settings: SettingsDataStore,
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
    private val categoryRepository: CategoryRepository
) : ViewModel() {

    private val _state = MutableStateFlow(SettingsState())
    val state: StateFlow<SettingsState> = _state.asStateFlow()

    init {
        combine(settings.currency, settings.themeMode) { currency, theme ->
            SettingsState(currency = currency, themeMode = theme)
        }.onEach { _state.value = it.copy(exportMessage = _state.value.exportMessage) }
            .launchIn(viewModelScope)
    }

    fun setCurrency(currency: String) {
        viewModelScope.launch { settings.setCurrency(currency) }
    }

    fun setTheme(mode: ThemeMode) {
        viewModelScope.launch { settings.setThemeMode(mode) }
    }

    fun exportCsv() {
        viewModelScope.launch {
            try {
                val txs = transactionRepository.observeAll().first()
                val accs = accountRepository.observeAccounts().first()
                val cats = categoryRepository.observeAll().first()
                val file = CsvExporter.export(context, txs, accs, cats)
                _state.value = _state.value.copy(
                    exportMessage = "Exportado: ${file.absolutePath}"
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    exportMessage = "Error al exportar: ${e.message}"
                )
            }
        }
    }

    fun clearExportMessage() {
        _state.value = _state.value.copy(exportMessage = null)
    }
}
