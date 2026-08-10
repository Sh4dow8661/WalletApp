package com.walletapp.domain.repository

import com.walletapp.domain.model.Category
import com.walletapp.domain.model.TransactionType
import kotlinx.coroutines.flow.Flow

interface CategoryRepository {
    fun observeAll(): Flow<List<Category>>
    fun observeByType(type: TransactionType): Flow<List<Category>>
    suspend fun getById(id: Long): Category?
    suspend fun upsert(category: Category): Long
    suspend fun delete(category: Category)
    suspend fun count(): Int
}
