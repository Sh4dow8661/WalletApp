package com.walletapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

object IconMapper {
    val options = listOf(
        "Restaurant", "DirectionsCar", "Home", "Movie", "LocalHospital",
        "ShoppingCart", "School", "Lightbulb", "Category", "Work",
        "Computer", "CardGiftcard", "TrendingUp", "AttachMoney",
        "Payments", "AccountBalance", "CreditCard"
    )

    fun iconFor(name: String): ImageVector = when (name) {
        "Restaurant" -> Icons.Default.Restaurant
        "DirectionsCar" -> Icons.Default.DirectionsCar
        "Home" -> Icons.Default.Home
        "Movie" -> Icons.Default.Movie
        "LocalHospital" -> Icons.Default.LocalHospital
        "ShoppingCart" -> Icons.Default.ShoppingCart
        "School" -> Icons.Default.School
        "Lightbulb" -> Icons.Default.Lightbulb
        "Work" -> Icons.Default.Work
        "Computer" -> Icons.Default.Computer
        "CardGiftcard" -> Icons.Default.CardGiftcard
        "TrendingUp" -> Icons.Default.TrendingUp
        "AttachMoney" -> Icons.Default.AttachMoney
        "Payments" -> Icons.Default.Payments
        "AccountBalance" -> Icons.Default.AccountBalance
        "CreditCard" -> Icons.Default.CreditCard
        else -> Icons.Default.Category
    }
}

fun parseColor(hex: String): Color = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (_: Exception) { Color.Gray }

@Composable
fun CategoryIconCircle(
    iconName: String,
    colorHex: String,
    size: Int = 40,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(size.dp)
            .background(parseColor(colorHex).copy(alpha = 0.2f), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = IconMapper.iconFor(iconName),
            contentDescription = null,
            tint = parseColor(colorHex)
        )
    }
}
