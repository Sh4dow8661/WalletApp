package com.walletapp.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "accounts")
data class AccountEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val type: String, // CASH, BANK, CREDIT_CARD
    val initialBalance: Double,
    val colorHex: String,
    val iconName: String,
    val includeInTotal: Boolean = true
)
