package com.walletapp.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

enum class ThemeMode { LIGHT, DARK, SYSTEM }

private val LightColors = lightColorScheme(
    primary = Primary,
    onPrimary = androidx.compose.ui.graphics.Color.White,
    primaryContainer = PrimaryLight,
    onPrimaryContainer = PrimaryDark,
    secondary = Secondary,
    tertiary = TertiaryGreen,
    background = SurfaceLight,
    surface = androidx.compose.ui.graphics.Color.White,
    onBackground = OnSurfaceLight,
    onSurface = OnSurfaceLight,
    error = ExpenseRed
)

private val DarkColors = darkColorScheme(
    primary = Primary,
    onPrimary = androidx.compose.ui.graphics.Color.White,
    primaryContainer = PrimaryDark,
    onPrimaryContainer = PrimaryLight,
    secondary = Secondary,
    tertiary = TertiaryGreen,
    background = SurfaceDark,
    surface = androidx.compose.ui.graphics.Color(0xFF1E1E1E),
    onBackground = OnSurfaceDark,
    onSurface = OnSurfaceDark,
    error = ExpenseRed
)

@Composable
fun WalletAppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colorScheme,
        typography = WalletTypography,
        content = content
    )
}
