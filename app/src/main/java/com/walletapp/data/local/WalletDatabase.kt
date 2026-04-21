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
    version = 3,
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

        /** Rediseño completo de la tabla budgets con rango de fechas, recurrencia,
         *  filtros de categoría/cuenta y opción de reducir con ingresos. */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("DROP TABLE IF EXISTS budgets")
                db.execSQL(
                    """
                    CREATE TABLE budgets (
                        id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        name        TEXT    NOT NULL,
                        amount      REAL    NOT NULL,
                        startDate   INTEGER NOT NULL,
                        endDate     INTEGER NOT NULL,
                        recurrence  TEXT    NOT NULL,
                        categoryIds TEXT    NOT NULL,
                        accountIds  TEXT    NOT NULL,
                        reduceByIncome INTEGER NOT NULL DEFAULT 0
                    )
                    """.trimIndent()
                )
            }
        }
    }
}
