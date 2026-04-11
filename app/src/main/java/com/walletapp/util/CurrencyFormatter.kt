package com.walletapp.util

import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

object CurrencyFormatter {
    fun format(amount: Double, currencyCode: String): String {
        return try {
            val nf = NumberFormat.getCurrencyInstance(Locale.getDefault())
            nf.currency = Currency.getInstance(currencyCode)
            nf.format(amount)
        } catch (_: Exception) {
            "$currencyCode ${"%.2f".format(amount)}"
        }
    }

    fun formatSigned(amount: Double, isExpense: Boolean, currencyCode: String): String {
        val prefix = if (isExpense) "-" else "+"
        return prefix + format(kotlin.math.abs(amount), currencyCode)
    }

    val supportedCurrencies = listOf(
        "USD", "EUR", "GBP", "JPY", "MXN", "ARS", "COP", "CLP", "PEN", "BRL",
        "CAD", "AUD", "CHF", "CNY", "INR", "KRW", "RUB", "TRY", "ZAR", "NOK"
    )
}
