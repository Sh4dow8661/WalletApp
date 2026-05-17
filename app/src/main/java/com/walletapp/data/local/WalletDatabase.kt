package com.walletapp.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.walletapp.data.local.dao.AccountDao
import com.walletapp.data.local.dao.BudgetDao
import com.walletapp.data.local.dao.CategoryDao
import com.walletapp.data.local.dao.TransactionBudgetDao
import com.walletapp.data.local.dao.TransactionDao
import com.walletapp.data.local.entity.AccountEntity
import com.walletapp.data.local.entity.BudgetEntity
import com.walletapp.data.local.entity.CategoryEntity
import com.walletapp.data.local.entity.TransactionBudgetCrossRef
import com.walletapp.data.local.entity.TransactionEntity

@Database(
    entities = [
        AccountEntity::class,
        CategoryEntity::class,
        TransactionEntity::class,
        BudgetEntity::class,
        TransactionBudgetCrossRef::class
    ],
    version = 5,
    exportSchema = false
)
abstract class WalletDatabase : RoomDatabase() {
    abstract fun accountDao(): AccountDao
    abstract fun categoryDao(): CategoryDao
    abstract fun transactionDao(): TransactionDao
    abstract fun budgetDao(): BudgetDao
    abstract fun transactionBudgetDao(): TransactionBudgetDao

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

        /** Añade la opción de contabilizar transferencias en el presupuesto
         *  según las cuentas seleccionadas. */
        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE budgets ADD COLUMN includeTransfers INTEGER NOT NULL DEFAULT 0")
            }
        }

        /**
         * Quita el matching automático por categoría/cuenta del presupuesto.
         * Ahora cada gasto se aplica manualmente a 0+ presupuestos mediante una
         * tabla de unión transaction_budget_ref. Se conservan nombre, monto,
         * fechas y recurrencia de los presupuestos existentes.
         */
        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Reconstruir budgets sin los campos obsoletos.
                db.execSQL(
                    """
                    CREATE TABLE budgets_new (
                        id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        name        TEXT    NOT NULL,
                        amount      REAL    NOT NULL,
                        startDate   INTEGER NOT NULL,
                        endDate     INTEGER NOT NULL,
                        recurrence  TEXT    NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    INSERT INTO budgets_new (id, name, amount, startDate, endDate, recurrence)
                    SELECT id, name, amount, startDate, endDate, recurrence FROM budgets
                    """.trimIndent()
                )
                db.execSQL("DROP TABLE budgets")
                db.execSQL("ALTER TABLE budgets_new RENAME TO budgets")

                // Tabla de unión transacción ↔ presupuesto.
                db.execSQL(
                    """
                    CREATE TABLE transaction_budget_ref (
                        transactionId INTEGER NOT NULL,
                        budgetId      INTEGER NOT NULL,
                        PRIMARY KEY (transactionId, budgetId),
                        FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE,
                        FOREIGN KEY (budgetId)      REFERENCES budgets(id)      ON DELETE CASCADE
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE INDEX index_transaction_budget_ref_transactionId ON transaction_budget_ref(transactionId)")
                db.execSQL("CREATE INDEX index_transaction_budget_ref_budgetId ON transaction_budget_ref(budgetId)")
            }
        }
    }
}
