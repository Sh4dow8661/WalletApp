package com.walletapp.domain.repository

import com.walletapp.domain.model.Budget
import kotlinx.coroutines.flow.Flow

interface BudgetRepository {
    fun observeByMonth(year: Int, month: Int): Flow<List<Budget>>
    fun observeAll(): Flow<List<Budget>>
    suspend fun getById(id: Long): Budget?
    suspend fun getByCategoryAndMonth(categoryId: Long, year: Int, month: Int): Budget?
    suspend fun upsert(budget: Budget): Long
    suspend fun delete(budget: Budget)
}
