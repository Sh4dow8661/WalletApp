package com.walletapp.data.repository

import com.walletapp.data.local.dao.BudgetDao
import com.walletapp.data.local.dao.TransactionBudgetDao
import com.walletapp.domain.model.Budget
import com.walletapp.domain.model.BudgetPeriod
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
    private val transactionBudgetDao: TransactionBudgetDao
) : BudgetRepository {

    @OptIn(ExperimentalCoroutinesApi::class)
    override fun observeAll(): Flow<List<Budget>> =
        budgetDao.observeAll().flatMapLatest { entities ->
            if (entities.isEmpty()) return@flatMapLatest flowOf(emptyList())

            val flows = entities.map { entity ->
                val baseBudget = entity.toDomain()
                val (periodStart, periodEnd) = BudgetPeriod.currentPeriod(
                    startDate = baseBudget.startDate,
                    endDate = baseBudget.endDate,
                    recurrence = baseBudget.recurrence
                )
                transactionBudgetDao
                    .observeSpentForBudgetInRange(entity.id, periodStart, periodEnd)
                    .map { spent ->
                        baseBudget.copy(
                            spent = spent,
                            periodStart = periodStart,
                            periodEnd = periodEnd
                        )
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
