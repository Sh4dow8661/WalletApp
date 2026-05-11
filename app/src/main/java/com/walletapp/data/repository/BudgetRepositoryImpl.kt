package com.walletapp.data.repository

import com.walletapp.data.local.dao.BudgetDao
import com.walletapp.data.local.dao.TransactionDao
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
    private val transactionDao: TransactionDao
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

                transactionDao.observeInRange(periodStart, periodEnd)
                    .map { txList ->
                        val catSet = baseBudget.categoryIds.toSet()
                        val accSet = baseBudget.accountIds.toSet()

                        val spent = txList.asSequence()
                            .filter { tx ->
                                tx.type == "EXPENSE" &&
                                (catSet.isEmpty() || tx.categoryId in catSet) &&
                                (accSet.isEmpty() || tx.accountId in accSet)
                            }
                            .sumOf { it.amount }

                        val income = if (baseBudget.reduceByIncome) {
                            txList.asSequence()
                                .filter { tx ->
                                    tx.type == "INCOME" &&
                                    (accSet.isEmpty() || tx.accountId in accSet)
                                }
                                .sumOf { it.amount }
                        } else 0.0

                        // Transferencias: solo cuentan si el usuario lo activó
                        // y el presupuesto tiene cuentas específicas (si está en
                        // "Todas las cuentas" no hay un "dentro/fuera" que comparar).
                        var transferSpent = 0.0
                        var transferIncome = 0.0
                        if (baseBudget.includeTransfers && accSet.isNotEmpty()) {
                            // Solo iteramos el lado outgoing para no contar dos veces:
                            // cada transferencia genera dos filas (outgoing en origen +
                            // incoming en destino), y la outgoing ya contiene origen
                            // (accountId) y destino (transferAccountId).
                            txList.asSequence()
                                .filter { it.type == "TRANSFER" && it.isOutgoing }
                                .forEach { tx ->
                                    val sourceInBudget = tx.accountId in accSet
                                    val destInBudget = tx.transferAccountId != null &&
                                        tx.transferAccountId in accSet
                                    when {
                                        sourceInBudget && !destInBudget ->
                                            transferSpent += tx.amount
                                        !sourceInBudget && destInBudget ->
                                            transferIncome += tx.amount
                                        // ambos dentro o ambos fuera: no afecta
                                    }
                                }
                        }

                        val finalSpent = spent + transferSpent
                        // Los ingresos por transferencia siguen la misma regla que
                        // los ingresos normales: solo reducen el presupuesto si
                        // reduceByIncome está activo.
                        val finalIncome = if (baseBudget.reduceByIncome)
                            income + transferIncome
                        else income

                        baseBudget.copy(
                            spent = finalSpent,
                            income = finalIncome,
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
