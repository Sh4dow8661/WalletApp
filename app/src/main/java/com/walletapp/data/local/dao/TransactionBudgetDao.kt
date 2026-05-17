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
     * Suma del monto de las transacciones tipo EXPENSE enlazadas a un presupuesto
     * cuya fecha cae dentro del rango (inclusive).
     */
    @Query(
        """
        SELECT COALESCE(SUM(t.amount), 0)
        FROM transactions t
        INNER JOIN transaction_budget_ref r ON r.transactionId = t.id
        WHERE r.budgetId = :budgetId
          AND t.type = 'EXPENSE'
          AND t.date BETWEEN :from AND :to
        """
    )
    fun observeSpentForBudgetInRange(budgetId: Long, from: Long, to: Long): Flow<Double>
}
