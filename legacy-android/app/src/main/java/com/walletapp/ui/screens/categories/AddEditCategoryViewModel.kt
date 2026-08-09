package com.walletapp.ui.screens.categories

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.domain.model.Category
import com.walletapp.domain.model.TransactionType
import com.walletapp.domain.repository.CategoryRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AddEditCategoryState(
    val id: Long = 0,
    val name: String = "",
    val type: TransactionType = TransactionType.EXPENSE,
    val iconName: String = "Category",
    val colorHex: String = "#78909C",
    val isDefault: Boolean = false,
    val saved: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class AddEditCategoryViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val categoryRepository: CategoryRepository
) : ViewModel() {

    private val _state = MutableStateFlow(AddEditCategoryState())
    val state: StateFlow<AddEditCategoryState> = _state.asStateFlow()

    private val categoryId: Long = savedStateHandle.get<Long>("id") ?: -1L

    init {
        if (categoryId > 0) {
            viewModelScope.launch {
                categoryRepository.getById(categoryId)?.let { c ->
                    _state.value = AddEditCategoryState(
                        id = c.id,
                        name = c.name,
                        type = c.type,
                        iconName = c.iconName,
                        colorHex = c.colorHex,
                        isDefault = c.isDefault
                    )
                }
            }
        }
    }

    fun setName(name: String) { _state.value = _state.value.copy(name = name) }
    fun setType(type: TransactionType) { _state.value = _state.value.copy(type = type) }
    fun setIcon(name: String) { _state.value = _state.value.copy(iconName = name) }
    fun setColor(hex: String) { _state.value = _state.value.copy(colorHex = hex) }

    fun save() {
        val s = _state.value
        if (s.name.isBlank()) {
            _state.value = s.copy(error = "Nombre requerido")
            return
        }
        viewModelScope.launch {
            val category = Category(
                id = s.id,
                name = s.name,
                type = s.type,
                iconName = s.iconName,
                colorHex = s.colorHex,
                isDefault = s.isDefault
            )
            categoryRepository.upsert(category)
            _state.value = _state.value.copy(saved = true, error = null)
        }
    }

    fun delete() {
        val s = _state.value
        if (s.id == 0L || s.isDefault) {
            _state.value = s.copy(error = "No se pueden eliminar categorías predefinidas")
            return
        }
        viewModelScope.launch {
            categoryRepository.getById(s.id)?.let { categoryRepository.delete(it) }
            _state.value = _state.value.copy(saved = true)
        }
    }
}
