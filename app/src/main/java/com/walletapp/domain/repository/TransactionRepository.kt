package com.walletapp.domain.repository

import com.walletapp.data.local.dao.CategorySum
import com.walletapp.data.local.dao.DailySum
import com.walletapp.domain.model.Transaction
import kotlinx.coroutines.flow.Flow

interface TransactionRepository {
    fun observeAll(): Flow<List<Transaction>>
    fun observeInRange(from: Long, to: Long): Flow<List<Transaction>>
    suspend fun getById(id: Long): Transaction?
    suspend fun upsert(transaction: Transaction): Long
    suspend fun delete(transaction: Transaction)

    fun observeIncomeInRange(from: Long, to: Long): Flow<Double>
    fun observeExpenseInRange(from: Long, to: Long): Flow<Double>
    fun observeExpenseByCategoryInRange(from: Long, to: Long): Flow<List<CategorySum>>
    fun observeDailyExpenseInRange(from: Long, to: Long): Flow<List<DailySum>>
    fun observeAccountBalanceDelta(accountId: Long): Flow<Double>

    suspend fun getExpenseForCategoryInRange(categoryId: Long, from: Long, to: Long): Double
}
