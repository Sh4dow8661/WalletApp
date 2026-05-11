package com.walletapp.domain.model

import com.walletapp.data.local.entity.AccountEntity
import com.walletapp.data.local.entity.BudgetEntity
import com.walletapp.data.local.entity.CategoryEntity
import com.walletapp.data.local.entity.TransactionEntity

fun AccountEntity.toDomain(currentBalance: Double = initialBalance): Account = Account(
    id = id,
    name = name,
    type = AccountType.fromString(type),
    initialBalance = initialBalance,
    currentBalance = currentBalance,
    colorHex = colorHex,
    iconName = iconName,
    includeInTotal = includeInTotal
)

fun Account.toEntity(): AccountEntity = AccountEntity(
    id = id,
    name = name,
    type = type.name,
    initialBalance = initialBalance,
    colorHex = colorHex,
    iconName = iconName,
    includeInTotal = includeInTotal
)

fun CategoryEntity.toDomain(): Category = Category(
    id = id,
    name = name,
    type = TransactionType.fromString(type),
    iconName = iconName,
    colorHex = colorHex,
    isDefault = isDefault
)

fun Category.toEntity(): CategoryEntity = CategoryEntity(
    id = id,
    name = name,
    type = type.name,
    iconName = iconName,
    colorHex = colorHex,
    isDefault = isDefault
)

fun TransactionEntity.toDomain(): Transaction = Transaction(
    id = id,
    amount = amount,
    type = TransactionType.fromString(type),
    categoryId = categoryId,
    accountId = accountId,
    transferAccountId = transferAccountId,
    note = note,
    date = date,
    isOutgoing = isOutgoing
)

fun Transaction.toEntity(): TransactionEntity = TransactionEntity(
    id = id,
    amount = amount,
    type = type.name,
    categoryId = categoryId,
    accountId = accountId,
    transferAccountId = transferAccountId,
    note = note,
    date = date,
    isOutgoing = isOutgoing
)

fun BudgetEntity.toDomain(spent: Double = 0.0, income: Double = 0.0): Budget = Budget(
    id = id,
    name = name,
    amount = amount,
    startDate = startDate,
    endDate = endDate,
    recurrence = BudgetRecurrence.fromString(recurrence),
    categoryIds = if (categoryIds.isBlank()) emptyList()
                  else categoryIds.split(",").mapNotNull { it.toLongOrNull() },
    accountIds = if (accountIds.isBlank()) emptyList()
                 else accountIds.split(",").mapNotNull { it.toLongOrNull() },
    reduceByIncome = reduceByIncome,
    includeTransfers = includeTransfers,
    spent = spent,
    income = income
)

fun Budget.toEntity(): BudgetEntity = BudgetEntity(
    id = id,
    name = name,
    amount = amount,
    startDate = startDate,
    endDate = endDate,
    recurrence = recurrence.name,
    categoryIds = categoryIds.joinToString(","),
    accountIds = accountIds.joinToString(","),
    reduceByIncome = reduceByIncome,
    includeTransfers = includeTransfers
)
