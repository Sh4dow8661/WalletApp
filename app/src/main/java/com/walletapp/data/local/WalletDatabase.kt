package com.walletapp.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.walletapp.data.local.dao.AccountDao
import com.walletapp.data.local.dao.BudgetDao
import com.walletapp.data.local.dao.CategoryDao
import com.walletapp.data.local.dao.TransactionDao
import com.walletapp.data.local.entity.AccountEntity
import com.walletapp.data.local.entity.BudgetEntity
import com.walletapp.data.local.entity.CategoryEntity
import com.walletapp.data.local.entity.TransactionEntity

@Database(
    entities = [
        AccountEntity::class,
        CategoryEntity::class,
        TransactionEntity::class,
        BudgetEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class WalletDatabase : RoomDatabase() {
    abstract fun accountDao(): AccountDao
    abstract fun categoryDao(): CategoryDao
    abstract fun transactionDao(): TransactionDao
    abstract fun budgetDao(): BudgetDao

    companion object {
        const val DATABASE_NAME = "wallet_database"
    }
}
