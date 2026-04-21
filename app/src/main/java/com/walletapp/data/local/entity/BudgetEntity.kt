package com.walletapp.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "budgets")
data class BudgetEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val amount: Double,
    val startDate: Long,         // epoch millis — inicio del período
    val endDate: Long,           // epoch millis — fin del período (inclusive)
    val recurrence: String,      // BudgetRecurrence.name
    val categoryIds: String,     // IDs separados por coma, "" = todas
    val accountIds: String,      // IDs separados por coma, "" = todas
    val reduceByIncome: Boolean = false
)
