package com.walletapp.data.repository

import com.walletapp.data.local.dao.BudgetDao
import com.walletapp.data.local.dao.TransactionDao
import com.walletapp.domain.model.Budget
import com.walletapp.domain.model.toDomain
import com.walletapp.domain.model.toEntity
import com.walletapp.domain.repository.BudgetRepository
import com.walletapp.util.DateUtils
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
    override fun observeByMonth(year: Int, month: Int): Flow<List<Budget>> =
        budgetDao.observeByMonth(year, month).flatMapLatest { entities ->
            if (entities.isEmpty()) flowOf(emptyList())
            else {
                val (from, to) = DateUtils.monthRange(year, month)
                val spentFlows = entities.map { e ->
                    transactionDao.observeExpenseByCategoryInRange(from, to)
                }
                combine(spentFlows) { spentLists ->
                    entities.mapIndexed { i, entity ->
                        val total = spentLists[i].firstOrNull { it.categoryId == entity.categoryId }?.total ?: 0.0
                        entity.toDomain(spent = total)
                    }
                }
            }
        }

    override fun observeAll(): Flow<List<Budget>> =
        budgetDao.observeAll().map { list -> list.map { it.toDomain() } }

    override suspend fun getById(id: Long): Budget? =
        budgetDao.getById(id)?.toDomain()

    override suspend fun getByCategoryAndMonth(categoryId: Long, year: Int, month: Int): Budget? =
        budgetDao.getByCategoryAndMonth(categoryId, year, month)?.toDomain()

    override suspend fun upsert(budget: Budget): Long {
        return if (budget.id == 0L) budgetDao.insert(budget.toEntity())
        else {
            budgetDao.update(budget.toEntity()); budget.id
        }
    }

    override suspend fun delete(budget: Budget) {
        budgetDao.delete(budget.toEntity())
    }
}
