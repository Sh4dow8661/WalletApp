package com.walletapp.domain.model

data class Account(
    val id: Long = 0,
    val name: String,
    val type: AccountType,
    val initialBalance: Double,
    val currentBalance: Double = initialBalance,
    val colorHex: String,
    val iconName: String,
    val includeInTotal: Boolean = true
)
