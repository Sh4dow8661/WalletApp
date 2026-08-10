package com.walletapp.data.local

import com.walletapp.data.local.entity.AccountEntity
import com.walletapp.data.local.entity.CategoryEntity

object DefaultData {

    val defaultAccounts = listOf(
        AccountEntity(
            name = "Efectivo",
            type = "CASH",
            initialBalance = 0.0,
            colorHex = "#4CAF50",
            iconName = "Payments"
        ),
        AccountEntity(
            name = "Banco",
            type = "BANK",
            initialBalance = 0.0,
            colorHex = "#2196F3",
            iconName = "AccountBalance"
        ),
        AccountEntity(
            name = "Tarjeta de Crédito",
            type = "CREDIT_CARD",
            initialBalance = 0.0,
            colorHex = "#F44336",
            iconName = "CreditCard"
        )
    )

    val defaultExpenseCategories = listOf(
        CategoryEntity(name = "Comida", type = "EXPENSE", iconName = "Restaurant", colorHex = "#FF7043", isDefault = true),
        CategoryEntity(name = "Transporte", type = "EXPENSE", iconName = "DirectionsCar", colorHex = "#42A5F5", isDefault = true),
        CategoryEntity(name = "Vivienda", type = "EXPENSE", iconName = "Home", colorHex = "#8D6E63", isDefault = true),
        CategoryEntity(name = "Entretenimiento", type = "EXPENSE", iconName = "Movie", colorHex = "#AB47BC", isDefault = true),
        CategoryEntity(name = "Salud", type = "EXPENSE", iconName = "LocalHospital", colorHex = "#EF5350", isDefault = true),
        CategoryEntity(name = "Compras", type = "EXPENSE", iconName = "ShoppingCart", colorHex = "#EC407A", isDefault = true),
        CategoryEntity(name = "Educación", type = "EXPENSE", iconName = "School", colorHex = "#5C6BC0", isDefault = true),
        CategoryEntity(name = "Servicios", type = "EXPENSE", iconName = "Lightbulb", colorHex = "#FFA726", isDefault = true),
        CategoryEntity(name = "Otros", type = "EXPENSE", iconName = "Category", colorHex = "#78909C", isDefault = true)
    )

    val defaultIncomeCategories = listOf(
        CategoryEntity(name = "Salario", type = "INCOME", iconName = "Work", colorHex = "#66BB6A", isDefault = true),
        CategoryEntity(name = "Freelance", type = "INCOME", iconName = "Computer", colorHex = "#26A69A", isDefault = true),
        CategoryEntity(name = "Regalos", type = "INCOME", iconName = "CardGiftcard", colorHex = "#EC407A", isDefault = true),
        CategoryEntity(name = "Intereses", type = "INCOME", iconName = "TrendingUp", colorHex = "#29B6F6", isDefault = true),
        CategoryEntity(name = "Otros", type = "INCOME", iconName = "AttachMoney", colorHex = "#9CCC65", isDefault = true)
    )

    val allDefaultCategories = defaultExpenseCategories + defaultIncomeCategories
}
