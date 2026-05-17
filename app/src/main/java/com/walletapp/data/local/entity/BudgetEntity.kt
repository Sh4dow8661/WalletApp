package com.walletapp.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "budgets")
data class BudgetEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val amount: Double,
    val startDate: Long,         // epoch millis — inicio del primer período
    val endDate: Long,           // epoch millis — fin (solo NONE); para recurrentes es referencia
    val recurrence: String       // BudgetRecurrence.name
)
