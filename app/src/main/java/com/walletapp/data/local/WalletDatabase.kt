package com.walletapp.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
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
    version = 2,
    exportSchema = false
)
abstract class WalletDatabase : RoomDatabase() {
    abstract fun accountDao(): AccountDao
    abstract fun categoryDao(): CategoryDao
    abstract fun transactionDao(): TransactionDao
    abstract fun budgetDao(): BudgetDao

    companion object {
        const val DATABASE_NAME = "wallet_database"

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE transactions ADD COLUMN isOutgoing INTEGER NOT NULL DEFAULT 0")
            }
        }
    }
}
