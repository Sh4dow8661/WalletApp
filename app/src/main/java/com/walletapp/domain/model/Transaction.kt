package com.walletapp.domain.model

data class Transaction(
    val id: Long = 0,
    val amount: Double,
    val type: TransactionType,
    val categoryId: Long?,
    val accountId: Long,
    val transferAccountId: Long? = null,
    val note: String = "",
    val date: Long
)
