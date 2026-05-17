package com.walletapp.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.walletapp.data.local.entity.TransactionEntity
import kotlinx.coroutines.flow.Flow

data class CategorySum(
    val categoryId: Long?,
    val total: Double
)

data class DailySum(
    val day: Long,
    val total: Double
)

@Dao
interface TransactionDao {

    @Query("SELECT * FROM transactions ORDER BY date DESC")
    fun observeAll(): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions WHERE date BETWEEN :from AND :to ORDER BY date DESC")
    fun observeInRange(from: Long, to: Long): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions WHERE id = :id")
    suspend fun getById(id: Long): TransactionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(transaction: TransactionEntity): Long

    @Update
    suspend fun update(transaction: TransactionEntity)

    @Delete
    suspend fun delete(transaction: TransactionEntity)

    @Query("""
        SELECT COALESCE(SUM(CASE WHEN type='INCOME' OR (type='TRANSFER' AND isOutgoing=0) THEN amount ELSE 0 END),0)
             - COALESCE(SUM(CASE WHEN type='EXPENSE' OR (type='TRANSFER' AND isOutgoing=1) THEN amount ELSE 0 END),0)
        FROM transactions WHERE accountId = :accountId
    """)
    fun observeAccountBalanceDelta(accountId: Long): Flow<Double>

    @Query("""
        SELECT COALESCE(SUM(CASE WHEN type='INCOME' OR (type='TRANSFER' AND isOutgoing=0) THEN amount ELSE 0 END),0)
             - COALESCE(SUM(CASE WHEN type='EXPENSE' OR (type='TRANSFER' AND isOutgoing=1) THEN amount ELSE 0 END),0)
        FROM transactions WHERE accountId = :accountId
    """)
    suspend fun getAccountBalanceDelta(accountId: Long): Double

    @Query("""
        SELECT COALESCE(SUM(CASE WHEN type='INCOME' THEN amount ELSE 0 END),0) as income
        FROM transactions WHERE date BETWEEN :from AND :to
    """)
    fun observeIncomeInRange(from: Long, to: Long): Flow<Double>

    @Query("""
        SELECT COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount ELSE 0 END),0) as expense
        FROM transactions WHERE date BETWEEN :from AND :to
    """)
    fun observeExpenseInRange(from: Long, to: Long): Flow<Double>

    @Query("""
        SELECT categoryId as categoryId, SUM(amount) as total
        FROM transactions
        WHERE type = 'EXPENSE' AND date BETWEEN :from AND :to
        GROUP BY categoryId
        ORDER BY total DESC
    """)
    fun observeExpenseByCategoryInRange(from: Long, to: Long): Flow<List<CategorySum>>

    @Query("""
        SELECT categoryId as categoryId, SUM(amount) as total
        FROM transactions
        WHERE type = 'EXPENSE' AND categoryId = :categoryId AND date BETWEEN :from AND :to
        GROUP BY categoryId
    """)
    suspend fun getExpenseForCategoryInRange(categoryId: Long, from: Long, to: Long): CategorySum?

    @Query("""
        SELECT (date / 86400000) * 86400000 as day, SUM(amount) as total
        FROM transactions
        WHERE type = 'EXPENSE' AND date BETWEEN :from AND :to
        GROUP BY day
        ORDER BY day ASC
    """)
    fun observeDailyExpenseInRange(from: Long, to: Long): Flow<List<DailySum>>
}
