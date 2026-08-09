package com.walletapp.domain.repository

import com.walletapp.domain.model.Account
import kotlinx.coroutines.flow.Flow

interface AccountRepository {
    fun observeAccounts(): Flow<List<Account>>
    fun observeAccountById(id: Long): Flow<Account?>
    suspend fun getAccountById(id: Long): Account?
    suspend fun upsert(account: Account): Long
    suspend fun delete(account: Account)
    suspend fun count(): Int
}
