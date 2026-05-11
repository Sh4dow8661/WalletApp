package com.walletapp.domain.model

import java.util.Calendar
import java.util.concurrent.TimeUnit

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
    /** Inicio del primer período (anchor). Para presupuestos recurrentes define el día/hora de corte. */
    val startDate: Long,
    /** Fin del primer período. Para NONE es el fin del presupuesto; para recurrentes solo se usa al crear. */
    val endDate: Long,
    val recurrence: BudgetRecurrence = BudgetRecurrence.NONE,
    val categoryIds: List<Long> = emptyList(), // empty = todas las categorías de gasto
    val accountIds: List<Long> = emptyList(),  // empty = todas las cuentas
    val reduceByIncome: Boolean = false,
    /** Gasto del período actual (calculado por el repositorio). */
    val spent: Double = 0.0,
    /** Ingreso del período actual (calculado por el repositorio, solo si reduceByIncome). */
    val income: Double = 0.0,
    /** Inicio del período actual (calculado dinámicamente). */
    val periodStart: Long = startDate,
    /** Fin del período actual (calculado dinámicamente). */
    val periodEnd: Long = endDate
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

    /** Para presupuestos recurrentes: siempre activo desde startDate. Para NONE: dentro del rango. */
    val isActive: Boolean
        get() {
            val now = System.currentTimeMillis()
            return if (recurrence == BudgetRecurrence.NONE) {
                now in startDate..endDate
            } else {
                now >= startDate
            }
        }

    /** Días restantes en el período actual (mínimo 0). */
    val daysRemaining: Int
        get() {
            val now = System.currentTimeMillis()
            if (now > periodEnd) return 0
            val diff = periodEnd - now
            return (TimeUnit.MILLISECONDS.toDays(diff) + 1).toInt().coerceAtLeast(0)
        }

    /** Duración total del período actual en días. */
    val periodDurationDays: Int
        get() {
            val diff = periodEnd - periodStart
            return (TimeUnit.MILLISECONDS.toDays(diff) + 1).toInt().coerceAtLeast(1)
        }

    /** Gasto sugerido por día para no excederse en lo que queda del período. */
    val suggestedDailySpend: Double
        get() = if (daysRemaining > 0) remaining / daysRemaining else 0.0
}

object BudgetPeriod {

    /**
     * Calcula el período actual (start, end) para un presupuesto.
     * Para presupuestos no recurrentes devuelve (startDate, endDate).
     * Para recurrentes calcula el período que contiene `now`, anclado en startDate.
     * Si `now` es anterior a startDate, devuelve el primer período.
     */
    fun currentPeriod(
        startDate: Long,
        endDate: Long,
        recurrence: BudgetRecurrence,
        now: Long = System.currentTimeMillis()
    ): Pair<Long, Long> {
        if (recurrence == BudgetRecurrence.NONE) return startDate to endDate
        if (now < startDate) return startDate to firstPeriodEnd(startDate, recurrence)

        return when (recurrence) {
            BudgetRecurrence.WEEKLY -> rollingPeriod(startDate, now, daysPerPeriod = 7)
            BudgetRecurrence.BIWEEKLY -> rollingPeriod(startDate, now, daysPerPeriod = 14)
            BudgetRecurrence.MONTHLY -> monthlyPeriod(startDate, now)
            BudgetRecurrence.NONE -> startDate to endDate
        }
    }

    private fun firstPeriodEnd(startDate: Long, recurrence: BudgetRecurrence): Long = when (recurrence) {
        BudgetRecurrence.WEEKLY -> startDate + TimeUnit.DAYS.toMillis(7) - 1L
        BudgetRecurrence.BIWEEKLY -> startDate + TimeUnit.DAYS.toMillis(14) - 1L
        BudgetRecurrence.MONTHLY -> {
            val cal = Calendar.getInstance().apply {
                timeInMillis = startDate
                add(Calendar.MONTH, 1)
                add(Calendar.MILLISECOND, -1)
            }
            cal.timeInMillis
        }
        BudgetRecurrence.NONE -> startDate
    }

    private fun rollingPeriod(startDate: Long, now: Long, daysPerPeriod: Int): Pair<Long, Long> {
        val periodMs = TimeUnit.DAYS.toMillis(daysPerPeriod.toLong())
        val elapsed = now - startDate
        val periodIndex = elapsed / periodMs
        val periodStart = startDate + periodIndex * periodMs
        val periodEnd = periodStart + periodMs - 1L
        return periodStart to periodEnd
    }

    /**
     * Para mensuales: el período actual es el mes que contiene `now`, comenzando
     * en el día-del-mes del startDate (anchor). Si el anchor es 31 y el mes solo
     * tiene 30 días, se ajusta al último día disponible.
     */
    private fun monthlyPeriod(startDate: Long, now: Long): Pair<Long, Long> {
        val anchor = Calendar.getInstance().apply { timeInMillis = startDate }
        val anchorDay = anchor.get(Calendar.DAY_OF_MONTH)
        val anchorHour = anchor.get(Calendar.HOUR_OF_DAY)
        val anchorMin = anchor.get(Calendar.MINUTE)
        val anchorSec = anchor.get(Calendar.SECOND)
        val anchorMs = anchor.get(Calendar.MILLISECOND)

        val cal = Calendar.getInstance().apply { timeInMillis = now }

        // Determinar el inicio del período: o este mes si ya pasó el día-anchor,
        // o el mes anterior si aún no.
        val candidate = (cal.clone() as Calendar).apply {
            val maxDay = getActualMaximum(Calendar.DAY_OF_MONTH)
            set(Calendar.DAY_OF_MONTH, minOf(anchorDay, maxDay))
            set(Calendar.HOUR_OF_DAY, anchorHour)
            set(Calendar.MINUTE, anchorMin)
            set(Calendar.SECOND, anchorSec)
            set(Calendar.MILLISECOND, anchorMs)
        }

        if (candidate.timeInMillis > now) {
            candidate.add(Calendar.MONTH, -1)
            val maxDay = candidate.getActualMaximum(Calendar.DAY_OF_MONTH)
            candidate.set(Calendar.DAY_OF_MONTH, minOf(anchorDay, maxDay))
        }

        val periodStart = candidate.timeInMillis

        val end = (candidate.clone() as Calendar).apply {
            add(Calendar.MONTH, 1)
            add(Calendar.MILLISECOND, -1)
        }
        return periodStart to end.timeInMillis
    }
}
