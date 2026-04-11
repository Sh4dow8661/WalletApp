package com.walletapp.util

import android.content.Context
import com.walletapp.domain.model.Account
import com.walletapp.domain.model.Category
import com.walletapp.domain.model.Transaction
import java.io.File
import java.io.FileWriter

object CsvExporter {

    fun export(
        context: Context,
        transactions: List<Transaction>,
        accounts: List<Account>,
        categories: List<Category>
    ): File {
        val accountById = accounts.associateBy { it.id }
        val categoryById = categories.associateBy { it.id }

        val dir = File(context.getExternalFilesDir(null), "exports")
        if (!dir.exists()) dir.mkdirs()
        val file = File(dir, "wallet_export_${System.currentTimeMillis()}.csv")

        FileWriter(file).use { writer ->
            writer.appendLine("Date,Type,Amount,Category,Account,TransferAccount,Note")
            transactions.forEach { tx ->
                val date = DateUtils.formatIsoDateTime(tx.date)
                val category = tx.categoryId?.let { categoryById[it]?.name } ?: ""
                val account = accountById[tx.accountId]?.name ?: ""
                val transferAccount = tx.transferAccountId?.let { accountById[it]?.name } ?: ""
                val note = tx.note.replace(",", " ").replace("\n", " ")
                writer.appendLine(
                    "$date,${tx.type.name},${tx.amount},$category,$account,$transferAccount,$note"
                )
            }
        }
        return file
    }
}
