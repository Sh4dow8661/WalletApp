package com.walletapp.ui.screens.scanreceipt

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.data.ml.ReceiptScanException
import com.walletapp.data.ml.ReceiptScanner
import com.walletapp.data.preferences.SettingsDataStore
import com.walletapp.domain.model.Account
import com.walletapp.domain.model.Budget
import com.walletapp.domain.model.Category
import com.walletapp.domain.model.Transaction
import com.walletapp.domain.model.TransactionType
import com.walletapp.domain.receipt.FieldConfidence
import com.walletapp.domain.receipt.ReceiptCategorizer
import com.walletapp.domain.receipt.ReceiptParser
import com.walletapp.domain.repository.AccountRepository
import com.walletapp.domain.repository.BudgetRepository
import com.walletapp.domain.repository.CategoryRepository
import com.walletapp.domain.repository.TransactionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

/** Etapas del flujo de escaneo. */
enum class ScanStage { CAPTURE, ANALYZING, REVIEW, ERROR }

data class ScanReceiptState(
    val stage: ScanStage = ScanStage.CAPTURE,
    val receiptImageUri: Uri? = null,
    // Campos editables de la revisión.
    val amount: String = "",
    val merchant: String = "",
    val date: Long = System.currentTimeMillis(),
    val accountId: Long? = null,
    val categoryId: Long? = null,
    val selectedBudgetIds: Set<Long> = emptySet(),
    // Datos disponibles.
    val accounts: List<Account> = emptyList(),
    val categories: List<Category> = emptyList(),
    val budgets: List<Budget> = emptyList(),
    // Confianza por campo (para resaltar en ámbar lo dudoso).
    val amountConfidence: FieldConfidence = FieldConfidence.LOW,
    val merchantConfidence: FieldConfidence = FieldConfidence.LOW,
    val dateConfidence: FieldConfidence = FieldConfidence.LOW,
    val currencyRaw: String? = null,
    val errorMessage: String? = null,
    val saveError: String? = null,
    val saved: Boolean = false
) {
    val expenseCategories: List<Category>
        get() = categories.filter { it.type == TransactionType.EXPENSE }
}

@HiltViewModel
class ScanReceiptViewModel @Inject constructor(
    private val scanner: ReceiptScanner,
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
    private val accountRepository: AccountRepository,
    private val budgetRepository: BudgetRepository,
    private val settings: SettingsDataStore
) : ViewModel() {

    private val _state = MutableStateFlow(ScanReceiptState())
    val state: StateFlow<ScanReceiptState> = _state.asStateFlow()

    init {
        combine(
            categoryRepository.observeAll(),
            accountRepository.observeAccounts(),
            budgetRepository.observeAll()
        ) { cats, accs, buds -> Triple(cats, accs, buds) }
            .onEach { (cats, accs, buds) ->
                _state.value = _state.value.copy(
                    categories = cats,
                    accounts = accs,
                    budgets = buds
                )
            }.launchIn(viewModelScope)
    }

    /** Llamado cuando la cámara o la galería entregan la imagen del recibo. */
    fun onImageCaptured(uri: Uri) {
        _state.value = _state.value.copy(
            stage = ScanStage.ANALYZING,
            receiptImageUri = uri,
            errorMessage = null
        )
        viewModelScope.launch {
            try {
                val lines = scanner.scan(uri)
                val parsed = ReceiptParser.parse(lines)
                if (parsed.isEmpty) {
                    _state.value = _state.value.copy(
                        stage = ScanStage.ERROR,
                        errorMessage = "No pudimos leer el recibo. Asegúrate de que la foto " +
                            "esté nítida y bien iluminada."
                    )
                    return@launch
                }

                val ticketDate = parsed.date ?: System.currentTimeMillis()
                val current = _state.value
                val suggestion = ReceiptCategorizer.categorize(
                    merchant = parsed.merchant,
                    date = ticketDate,
                    categories = current.categories,
                    accounts = current.accounts,
                    budgets = current.budgets,
                    preferredAccountId = settings.defaultScanAccountId.first(),
                    lastUsedAccountId = transactionRepository.getLastUsedExpenseAccountId()
                )

                _state.value = current.copy(
                    stage = ScanStage.REVIEW,
                    amount = parsed.total?.let { String.format(Locale.US, "%.2f", it) } ?: "",
                    merchant = parsed.merchant.orEmpty(),
                    date = ticketDate,
                    accountId = suggestion.accountId,
                    categoryId = suggestion.categoryId,
                    selectedBudgetIds = suggestion.budgetIds.toSet(),
                    amountConfidence = if (parsed.total != null) parsed.totalConfidence else FieldConfidence.LOW,
                    merchantConfidence = parsed.merchantConfidence,
                    dateConfidence = parsed.dateConfidence,
                    currencyRaw = parsed.currencyRaw,
                    saveError = null
                )
            } catch (e: ReceiptScanException) {
                _state.value = _state.value.copy(stage = ScanStage.ERROR, errorMessage = e.message)
            } catch (_: Exception) {
                _state.value = _state.value.copy(
                    stage = ScanStage.ERROR,
                    errorMessage = "Ocurrió un error al analizar la imagen. Inténtalo de nuevo."
                )
            }
        }
    }

    fun setAmount(value: String) { _state.value = _state.value.copy(amount = value) }
    fun setMerchant(value: String) { _state.value = _state.value.copy(merchant = value) }
    fun setDate(value: Long) { _state.value = _state.value.copy(date = value) }
    fun setAccount(id: Long?) { _state.value = _state.value.copy(accountId = id) }
    fun setCategory(id: Long?) { _state.value = _state.value.copy(categoryId = id) }

    fun toggleBudget(id: Long) {
        val current = _state.value.selectedBudgetIds.toMutableSet()
        if (!current.remove(id)) current.add(id)
        _state.value = _state.value.copy(selectedBudgetIds = current)
    }

    /** Vuelve a la captura para tomar otra foto; descarta la imagen anterior. */
    fun retake() {
        _state.value = _state.value.copy(
            stage = ScanStage.CAPTURE,
            receiptImageUri = null,
            errorMessage = null,
            saveError = null
        )
    }

    fun save() {
        val s = _state.value
        val amount = s.amount.toDoubleOrNull()
        if (amount == null || amount <= 0) {
            _state.value = s.copy(saveError = "Monto inválido")
            return
        }
        if (s.accountId == null) {
            _state.value = s.copy(saveError = "Selecciona una cuenta")
            return
        }
        if (s.categoryId == null) {
            _state.value = s.copy(saveError = "Selecciona una categoría")
            return
        }

        viewModelScope.launch {
            val tx = Transaction(
                amount = amount,
                type = TransactionType.EXPENSE,
                categoryId = s.categoryId,
                accountId = s.accountId,
                note = s.merchant.trim(),
                date = s.date
            )
            // Reutiliza el camino de guardado existente (suma al balance y enlaza presupuestos).
            transactionRepository.upsert(tx, budgetIds = s.selectedBudgetIds.toList())
            _state.value = _state.value.copy(saved = true, saveError = null)
        }
    }

    fun clearSaveError() { _state.value = _state.value.copy(saveError = null) }
}
