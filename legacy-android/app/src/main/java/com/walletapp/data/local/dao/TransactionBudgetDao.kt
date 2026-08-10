package com.walletapp.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.walletapp.data.local.entity.TransactionBudgetCrossRef
import kotlinx.coroutines.flow.Flow

@Dao
interface TransactionBudgetDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(refs: List<TransactionBudgetCrossRef>)

    @Query("DELETE FROM transaction_budget_ref WHERE transactionId = :transactionId")
    suspend fun deleteByTransaction(transactionId: Long)

    @Query("SELECT budgetId FROM transaction_budget_ref WHERE transactionId = :transactionId")
    suspend fun getBudgetIdsForTransaction(transactionId: Long): List<Long>

    /**
     * Gasto neto de un presupuesto en el rango: los EXPENSE enlazados suman,
     * los INCOME enlazados restan (actúan como reembolso, el presupuesto sube).
     */
    @Query(
        """
        SELECT COALESCE(SUM(
            CASE
                WHEN t.type = 'EXPENSE' THEN  t.amount
                WHEN t.type = 'INCOME'  THEN -t.amount
                ELSE 0
            END
        ), 0)
        FROM transactions t
        INNER JOIN transaction_budget_ref r ON r.transactionId = t.id
        WHERE r.budgetId = :budgetId
          AND t.date BETWEEN :from AND :to
        """
    )
    fun observeSpentForBudgetInRange(budgetId: Long, from: Long, to: Long): Flow<Double>
}
