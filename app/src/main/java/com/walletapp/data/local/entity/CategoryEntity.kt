package com.walletapp.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "categories")
data class CategoryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val type: String, // INCOME, EXPENSE
    val iconName: String,
    val colorHex: String,
    val isDefault: Boolean = false
)
