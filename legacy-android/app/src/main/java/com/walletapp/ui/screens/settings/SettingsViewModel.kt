package com.walletapp.ui.screens.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.BuildConfig
import com.walletapp.data.local.dao.ExportDao
import com.walletapp.data.preferences.SettingsDataStore
import com.walletapp.domain.model.Account
import com.walletapp.domain.repository.AccountRepository
import com.walletapp.domain.repository.CategoryRepository
import com.walletapp.domain.repository.TransactionRepository
import com.walletapp.ui.theme.ThemeMode
import com.walletapp.util.CsvExporter
import com.walletapp.util.JsonExporter
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

data class SettingsState(
    val currency: String = "USD",
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val accounts: List<Account> = emptyList(),
    /** Cuenta por defecto para escaneos; null = automático. */
    val defaultScanAccountId: Long? = null,
    val exportMessage: String? = null
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settings: SettingsDataStore,
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
    private val categoryRepository: CategoryRepository,
    private val exportDao: ExportDao
) : ViewModel() {

    private val _state = MutableStateFlow(SettingsState())
    val state: StateFlow<SettingsState> = _state.asStateFlow()

    private val _exportedFile = MutableSharedFlow<File>(extraBufferCapacity = 1)
    val exportedFile: SharedFlow<File> = _exportedFile.asSharedFlow()

    init {
        combine(
            settings.currency,
            settings.themeMode,
            accountRepository.observeAccounts(),
            settings.defaultScanAccountId
        ) { currency, theme, accounts, scanAccountId ->
            SettingsState(
                currency = currency,
                themeMode = theme,
                accounts = accounts,
                defaultScanAccountId = scanAccountId
            )
        }.onEach { _state.value = it.copy(exportMessage = _state.value.exportMessage) }
            .launchIn(viewModelScope)
    }

    fun setCurrency(currency: String) {
        viewModelScope.launch { settings.setCurrency(currency) }
    }

    fun setTheme(mode: ThemeMode) {
        viewModelScope.launch { settings.setThemeMode(mode) }
    }

    fun setDefaultScanAccount(id: Long?) {
        viewModelScope.launch { settings.setDefaultScanAccountId(id) }
    }

    fun exportCsv() {
        viewModelScope.launch {
            try {
                val txs = transactionRepository.observeAll().first()
                val accs = accountRepository.observeAccounts().first()
                val cats = categoryRepository.observeAll().first()
                val file = CsvExporter.export(context, txs, accs, cats)
                _exportedFile.tryEmit(file)
                _state.value = _state.value.copy(
                    exportMessage = "Listo: ${file.name}"
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    exportMessage = "Error al exportar: ${e.message}"
                )
            }
        }
    }

    /**
     * Vuelca la base entera a JSON, para migrar los datos a la PWA (§12).
     *
     * A diferencia del CSV, esto no pierde nada: lleva presupuestos, sus
     * enlaces, balances iniciales, colores, iconos, `includeInTotal` y la
     * dirección de las transferencias.
     */
    fun exportJson() {
        viewModelScope.launch {
            try {
                val file = JsonExporter.export(
                    context = context,
                    exportDao = exportDao,
                    currency = settings.currency.first(),
                    appVersionName = BuildConfig.VERSION_NAME,
                    databaseVersion = 5
                )
                _exportedFile.tryEmit(file)
                _state.value = _state.value.copy(exportMessage = "Listo: ${file.name}")
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    exportMessage = "Error al exportar JSON: ${e.message}"
                )
            }
        }
    }

    fun clearExportMessage() {
        _state.value = _state.value.copy(exportMessage = null)
    }
}
