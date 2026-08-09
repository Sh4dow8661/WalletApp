package com.walletapp.data.repository

import com.walletapp.data.local.dao.CategorySum
import com.walletapp.data.local.dao.DailySum
import com.walletapp.data.local.dao.TransactionBudgetDao
import com.walletapp.data.local.dao.TransactionDao
import com.walletapp.data.local.entity.TransactionBudgetCrossRef
import com.walletapp.domain.model.Transaction
import com.walletapp.domain.model.toDomain
import com.walletapp.domain.model.toEntity
import com.walletapp.domain.repository.TransactionRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

class TransactionRepositoryImpl @Inject constructor(
    private val transactionDao: TransactionDao,
    private val transactionBudgetDao: TransactionBudgetDao
) : TransactionRepository {

    override fun observeAll(): Flow<List<Transaction>> =
        transactionDao.observeAll().map { list -> list.map { it.toDomain() } }

    override fun observeInRange(from: Long, to: Long): Flow<List<Transaction>> =
        transactionDao.observeInRange(from, to).map { list -> list.map { it.toDomain() } }

    override suspend fun getById(id: Long): Transaction? =
        transactionDao.getById(id)?.toDomain()

    override suspend fun upsert(transaction: Transaction, budgetIds: List<Long>?): Long {
        val txId = if (transaction.id == 0L) {
            transactionDao.insert(transaction.toEntity())
        } else {
            transactionDao.update(transaction.toEntity())
            transaction.id
        }
        if (budgetIds != null) {
            transactionBudgetDao.deleteByTransaction(txId)
            if (budgetIds.isNotEmpty()) {
                transactionBudgetDao.insertAll(
                    budgetIds.distinct().map { TransactionBudgetCrossRef(txId, it) }
                )
            }
        }
        return txId
    }

    override suspend fun delete(transaction: Transaction) {
        // El borrado en cascada se encarga de eliminar los enlaces.
        transactionDao.delete(transaction.toEntity())
    }

    override suspend fun getBudgetIdsForTransaction(transactionId: Long): List<Long> =
        transactionBudgetDao.getBudgetIdsForTransaction(transactionId)

    override suspend fun getLastUsedExpenseAccountId(): Long? =
        transactionDao.lastExpenseAccountId()

    override fun observeIncomeInRange(from: Long, to: Long): Flow<Double> =
        transactionDao.observeIncomeInRange(from, to)

    override fun observeExpenseInRange(from: Long, to: Long): Flow<Double> =
        transactionDao.observeExpenseInRange(from, to)

    override fun observeExpenseByCategoryInRange(from: Long, to: Long): Flow<List<CategorySum>> =
        transactionDao.observeExpenseByCategoryInRange(from, to)

    override fun observeDailyExpenseInRange(from: Long, to: Long): Flow<List<DailySum>> =
        transactionDao.observeDailyExpenseInRange(from, to)

    override fun observeAccountBalanceDelta(accountId: Long): Flow<Double> =
        transactionDao.observeAccountBalanceDelta(accountId)

    override suspend fun getExpenseForCategoryInRange(categoryId: Long, from: Long, to: Long): Double =
        transactionDao.getExpenseForCategoryInRange(categoryId, from, to)?.total ?: 0.0
}
