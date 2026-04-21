package com.walletapp.data.repository

import com.walletapp.data.local.dao.BudgetDao
import com.walletapp.data.local.dao.TransactionDao
import com.walletapp.domain.model.Budget
import com.walletapp.domain.model.toDomain
import com.walletapp.domain.model.toEntity
import com.walletapp.domain.repository.BudgetRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import javax.inject.Inject

class BudgetRepositoryImpl @Inject constructor(
    private val budgetDao: BudgetDao,
    private val transactionDao: TransactionDao
) : BudgetRepository {

    @OptIn(ExperimentalCoroutinesApi::class)
    override fun observeAll(): Flow<List<Budget>> =
        budgetDao.observeAll().flatMapLatest { entities ->
            if (entities.isEmpty()) return@flatMapLatest flowOf(emptyList())

            val flows = entities.map { entity ->
                val baseBudget = entity.toDomain()
                transactionDao.observeInRange(entity.startDate, entity.endDate)
                    .map { txList ->
                        val catSet = baseBudget.categoryIds.toSet()
                        val accSet = baseBudget.accountIds.toSet()

                        val spent = txList.filter { tx ->
                            tx.type == "EXPENSE" &&
                            (catSet.isEmpty() || tx.categoryId in catSet) &&
                            (accSet.isEmpty() || tx.accountId in accSet)
                        }.sumOf { it.amount }

                        val income = if (baseBudget.reduceByIncome) {
                            txList.filter { tx ->
                                tx.type == "INCOME" &&
                                (accSet.isEmpty() || tx.accountId in accSet)
                            }.sumOf { it.amount }
                        } else 0.0

                        baseBudget.copy(spent = spent, income = income)
                    }
            }

            combine(flows) { it.toList() }
        }

    override suspend fun getById(id: Long): Budget? =
        budgetDao.getById(id)?.toDomain()

    override suspend fun upsert(budget: Budget): Long =
        if (budget.id == 0L) budgetDao.insert(budget.toEntity())
        else { budgetDao.update(budget.toEntity()); budget.id }

    override suspend fun delete(budget: Budget) =
        budgetDao.delete(budget.toEntity())
}
