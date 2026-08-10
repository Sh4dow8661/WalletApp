package com.walletapp.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import com.walletapp.data.local.entity.AccountEntity
import com.walletapp.data.local.entity.BudgetEntity
import com.walletapp.data.local.entity.CategoryEntity
import com.walletapp.data.local.entity.TransactionBudgetCrossRef
import com.walletapp.data.local.entity.TransactionEntity

/**
 * Lecturas completas para el volcado JSON.
 *
 * Va en un DAO aparte y no en los existentes porque su propósito es distinto:
 * aquí no interesa observar cambios ni filtrar, sino leer cada tabla entera una
 * sola vez. Los DAO normales devuelven `Flow` y aplican orden y filtros de
 * pantalla; mezclarlo ensuciaría ambos.
 *
 * Se añadió para migrar los datos a la PWA (§12). El CSV pierde presupuestos,
 * enlaces, balances iniciales, colores, iconos, `includeInTotal` y la dirección
 * de las transferencias; esto no pierde nada.
 */
@Dao
interface ExportDao {

    @Query("SELECT * FROM accounts ORDER BY id")
    suspend fun allAccounts(): List<AccountEntity>

    @Query("SELECT * FROM categories ORDER BY id")
    suspend fun allCategories(): List<CategoryEntity>

    @Query("SELECT * FROM transactions ORDER BY id")
    suspend fun allTransactions(): List<TransactionEntity>

    @Query("SELECT * FROM budgets ORDER BY id")
    suspend fun allBudgets(): List<BudgetEntity>

    @Query("SELECT * FROM transaction_budget_ref ORDER BY transactionId, budgetId")
    suspend fun allTransactionBudgetRefs(): List<TransactionBudgetCrossRef>
}
