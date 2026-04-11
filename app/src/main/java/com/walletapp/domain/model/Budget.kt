package com.walletapp.domain.model

data class Budget(
    val id: Long = 0,
    val categoryId: Long,
    val amount: Double,
    val month: Int,
    val year: Int,
    val spent: Double = 0.0
) {
    val progress: Float
        get() = if (amount > 0) (spent / amount).toFloat().coerceIn(0f, 1f) else 0f
    val isOverBudget: Boolean get() = spent > amount
    val isNearLimit: Boolean get() = progress >= 0.8f && !isOverBudget
}
