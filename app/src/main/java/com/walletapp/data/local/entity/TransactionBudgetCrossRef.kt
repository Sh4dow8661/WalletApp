package com.walletapp.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

/**
 * Relación N:M entre transacciones y presupuestos.
 * Una transacción puede aplicarse a 0, 1 o varios presupuestos según lo elija el usuario.
 */
@Entity(
    tableName = "transaction_budget_ref",
    primaryKeys = ["transactionId", "budgetId"],
    foreignKeys = [
        ForeignKey(
            entity = TransactionEntity::class,
            parentColumns = ["id"],
            childColumns = ["transactionId"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = BudgetEntity::class,
            parentColumns = ["id"],
            childColumns = ["budgetId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("transactionId"), Index("budgetId")]
)
data class TransactionBudgetCrossRef(
    val transactionId: Long,
    val budgetId: Long
)
