package com.walletapp.domain.model

enum class BudgetRecurrence(val label: String) {
    NONE("Una vez"),
    WEEKLY("Semanal"),
    BIWEEKLY("Quincenal"),
    MONTHLY("Mensual");

    companion object {
        fun fromString(s: String) = entries.find { it.name == s } ?: NONE
    }
}

data class Budget(
    val id: Long = 0,
    val name: String = "",
    val amount: Double,
    val startDate: Long,
    val endDate: Long,
    val recurrence: BudgetRecurrence = BudgetRecurrence.NONE,
    val categoryIds: List<Long> = emptyList(), // empty = todas las categorías de gasto
    val accountIds: List<Long> = emptyList(),  // empty = todas las cuentas
    val reduceByIncome: Boolean = false,
    val spent: Double = 0.0,
    val income: Double = 0.0
) {
    /** Monto efectivo del presupuesto (reducido por ingresos si está activado). */
    val effectiveAmount: Double
        get() = if (reduceByIncome) (amount - income).coerceAtLeast(0.0) else amount

    val progress: Float
        get() = if (effectiveAmount > 0) (spent / effectiveAmount).toFloat().coerceIn(0f, 1f) else 0f

    val remaining: Double
        get() = (effectiveAmount - spent).coerceAtLeast(0.0)

    val isOverBudget: Boolean get() = spent > effectiveAmount
    val isNearLimit: Boolean get() = progress >= 0.8f && !isOverBudget

    val isActive: Boolean
        get() {
            val now = System.currentTimeMillis()
            return now in startDate..endDate
        }
}
