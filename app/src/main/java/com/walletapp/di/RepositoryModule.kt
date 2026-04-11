package com.walletapp.di

import com.walletapp.data.repository.AccountRepositoryImpl
import com.walletapp.data.repository.BudgetRepositoryImpl
import com.walletapp.data.repository.CategoryRepositoryImpl
import com.walletapp.data.repository.TransactionRepositoryImpl
import com.walletapp.domain.repository.AccountRepository
import com.walletapp.domain.repository.BudgetRepository
import com.walletapp.domain.repository.CategoryRepository
import com.walletapp.domain.repository.TransactionRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds @Singleton
    abstract fun bindAccountRepository(impl: AccountRepositoryImpl): AccountRepository

    @Binds @Singleton
    abstract fun bindCategoryRepository(impl: CategoryRepositoryImpl): CategoryRepository

    @Binds @Singleton
    abstract fun bindTransactionRepository(impl: TransactionRepositoryImpl): TransactionRepository

    @Binds @Singleton
    abstract fun bindBudgetRepository(impl: BudgetRepositoryImpl): BudgetRepository
}
