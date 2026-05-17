package com.walletapp.di

import android.content.Context
import androidx.room.Room
import com.walletapp.data.local.DefaultData
import com.walletapp.data.local.WalletDatabase
import com.walletapp.data.local.dao.AccountDao
import com.walletapp.data.local.dao.BudgetDao
import com.walletapp.data.local.dao.CategoryDao
import com.walletapp.data.local.dao.TransactionBudgetDao
import com.walletapp.data.local.dao.TransactionDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): WalletDatabase {
        lateinit var instance: WalletDatabase
        instance = Room.databaseBuilder(
            context,
            WalletDatabase::class.java,
            WalletDatabase.DATABASE_NAME
        )
            .addMigrations(
                WalletDatabase.MIGRATION_1_2,
                WalletDatabase.MIGRATION_2_3,
                WalletDatabase.MIGRATION_3_4,
                WalletDatabase.MIGRATION_4_5
            )
            .addCallback(object : androidx.room.RoomDatabase.Callback() {
                override fun onCreate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                    super.onCreate(db)
                    CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                        instance.accountDao().insert(DefaultData.defaultAccounts[0])
                        instance.accountDao().insert(DefaultData.defaultAccounts[1])
                        instance.accountDao().insert(DefaultData.defaultAccounts[2])
                        instance.categoryDao().insertAll(DefaultData.allDefaultCategories)
                    }
                }
            })
            .build()
        return instance
    }

    @Provides fun provideAccountDao(db: WalletDatabase): AccountDao = db.accountDao()
    @Provides fun provideCategoryDao(db: WalletDatabase): CategoryDao = db.categoryDao()
    @Provides fun provideTransactionDao(db: WalletDatabase): TransactionDao = db.transactionDao()
    @Provides fun provideBudgetDao(db: WalletDatabase): BudgetDao = db.budgetDao()
    @Provides fun provideTransactionBudgetDao(db: WalletDatabase): TransactionBudgetDao = db.transactionBudgetDao()
}
