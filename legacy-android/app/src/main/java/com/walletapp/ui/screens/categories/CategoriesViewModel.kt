package com.walletapp.ui.screens.categories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.walletapp.domain.model.Category
import com.walletapp.domain.repository.CategoryRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import javax.inject.Inject

data class CategoriesState(val categories: List<Category> = emptyList())

@HiltViewModel
class CategoriesViewModel @Inject constructor(
    categoryRepository: CategoryRepository
) : ViewModel() {

    private val _state = MutableStateFlow(CategoriesState())
    val state: StateFlow<CategoriesState> = _state.asStateFlow()

    init {
        categoryRepository.observeAll().onEach {
            _state.value = CategoriesState(categories = it)
        }.launchIn(viewModelScope)
    }
}
