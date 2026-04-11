package com.walletapp.data.repository

import com.walletapp.data.local.dao.CategoryDao
import com.walletapp.domain.model.Category
import com.walletapp.domain.model.TransactionType
import com.walletapp.domain.model.toDomain
import com.walletapp.domain.model.toEntity
import com.walletapp.domain.repository.CategoryRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

class CategoryRepositoryImpl @Inject constructor(
    private val categoryDao: CategoryDao
) : CategoryRepository {

    override fun observeAll(): Flow<List<Category>> =
        categoryDao.observeAll().map { list -> list.map { it.toDomain() } }

    override fun observeByType(type: TransactionType): Flow<List<Category>> =
        categoryDao.observeByType(type.name).map { list -> list.map { it.toDomain() } }

    override suspend fun getById(id: Long): Category? =
        categoryDao.getById(id)?.toDomain()

    override suspend fun upsert(category: Category): Long {
        return if (category.id == 0L) categoryDao.insert(category.toEntity())
        else {
            categoryDao.update(category.toEntity()); category.id
        }
    }

    override suspend fun delete(category: Category) {
        categoryDao.delete(category.toEntity())
    }

    override suspend fun count(): Int = categoryDao.count()
}
