package com.walletapp.data.repository

import com.walletapp.data.local.dao.AccountDao
import com.walletapp.data.local.dao.TransactionDao
import com.walletapp.domain.model.Account
import com.walletapp.domain.model.toDomain
import com.walletapp.domain.model.toEntity
import com.walletapp.domain.repository.AccountRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import javax.inject.Inject

class AccountRepositoryImpl @Inject constructor(
    private val accountDao: AccountDao,
    private val transactionDao: TransactionDao
) : AccountRepository {

    @OptIn(ExperimentalCoroutinesApi::class)
    override fun observeAccounts(): Flow<List<Account>> =
        accountDao.observeAll().flatMapLatest { entities ->
            if (entities.isEmpty()) {
                flowOf(emptyList())
            } else {
                val deltaFlows = entities.map { e ->
                    transactionDao.observeAccountBalanceDelta(e.id)
                }
                combine(deltaFlows) { deltas ->
                    entities.mapIndexed { i, entity ->
                        entity.toDomain(currentBalance = entity.initialBalance + deltas[i])
                    }
                }
            }
        }

    @OptIn(ExperimentalCoroutinesApi::class)
    override fun observeAccountById(id: Long): Flow<Account?> =
        accountDao.observeById(id).flatMapLatest { entity ->
            if (entity == null) flowOf(null)
            else transactionDao.observeAccountBalanceDelta(id).map { delta ->
                entity.toDomain(currentBalance = entity.initialBalance + delta)
            }
        }

    override suspend fun getAccountById(id: Long): Account? =
        accountDao.getById(id)?.let { entity ->
            val delta = transactionDao.getAccountBalanceDelta(entity.id)
            entity.toDomain(currentBalance = entity.initialBalance + delta)
        }

    override suspend fun upsert(account: Account): Long {
        return if (account.id == 0L) accountDao.insert(account.toEntity())
        else {
            accountDao.update(account.toEntity()); account.id
        }
    }

    override suspend fun delete(account: Account) {
        accountDao.delete(account.toEntity())
    }

    override suspend fun count(): Int = accountDao.count()
}
