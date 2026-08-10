package com.walletapp.domain.repository

import com.walletapp.domain.model.Budget
import kotlinx.coroutines.flow.Flow

interface BudgetRepository {
    fun observeAll(): Flow<List<Budget>>
    suspend fun getById(id: Long): Budget?
    suspend fun upsert(budget: Budget): Long
    suspend fun delete(budget: Budget)
}
