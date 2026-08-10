package com.walletapp.domain.model

enum class TransactionType {
    INCOME, EXPENSE, TRANSFER;

    companion object {
        fun fromString(value: String): TransactionType = when (value) {
            "INCOME" -> INCOME
            "EXPENSE" -> EXPENSE
            "TRANSFER" -> TRANSFER
            else -> EXPENSE
        }
    }
}

enum class AccountType {
    CASH, BANK, CREDIT_CARD;

    companion object {
        fun fromString(value: String): AccountType = when (value) {
            "CASH" -> CASH
            "BANK" -> BANK
            "CREDIT_CARD" -> CREDIT_CARD
            else -> CASH
        }
    }
}
