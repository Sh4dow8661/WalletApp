package com.walletapp.domain.receipt

import com.walletapp.domain.model.Account
import com.walletapp.domain.model.AccountType
import com.walletapp.domain.model.Budget
import com.walletapp.domain.model.BudgetRecurrence
import com.walletapp.domain.model.Category
import com.walletapp.domain.model.TransactionType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

class ReceiptCategorizerTest {

    // --- Datos de prueba --------------------------------------------------------

    private fun cat(id: Long, name: String, type: TransactionType = TransactionType.EXPENSE) =
        Category(id = id, name = name, type = type, iconName = "Category", colorHex = "#000000")

    // Mismos nombres que DefaultData.
    private val categories = listOf(
        cat(1, "Comida"),
        cat(2, "Transporte"),
        cat(3, "Vivienda"),
        cat(4, "Entretenimiento"),
        cat(5, "Salud"),
        cat(6, "Compras"),
        cat(7, "Educación"),
        cat(8, "Servicios"),
        cat(9, "Otros"),
        cat(10, "Salario", TransactionType.INCOME) // debe ignorarse
    )

    private fun account(id: Long, name: String, type: AccountType) =
        Account(id = id, name = name, type = type, initialBalance = 0.0, currentBalance = 0.0,
            colorHex = "#000000", iconName = "Payments")

    private fun dateMillis(year: Int, month: Int, day: Int): Long =
        Calendar.getInstance().apply {
            clear(); set(year, month - 1, day, 0, 0, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis

    private fun idOf(name: String) = categories.first { it.name == name }.id

    // --- CATEGORÍA --------------------------------------------------------------

    @Test
    fun `mapea supermercados y restaurantes a Comida`() {
        assertEquals(idOf("Comida"), ReceiptCategorizer.suggestCategory("WALMART SUPERCENTER", categories)?.id)
        assertEquals(idOf("Comida"), ReceiptCategorizer.suggestCategory("STARBUCKS COFFEE", categories)?.id)
        assertEquals(idOf("Comida"), ReceiptCategorizer.suggestCategory("OXXO", categories)?.id)
    }

    @Test
    fun `mapea gasolineras a Transporte y prioriza OXXO GAS sobre OXXO`() {
        assertEquals(idOf("Transporte"), ReceiptCategorizer.suggestCategory("PEMEX E12345", categories)?.id)
        assertEquals(idOf("Transporte"), ReceiptCategorizer.suggestCategory("OXXO GAS AV REFORMA", categories)?.id)
    }

    @Test
    fun `mapea otras tiendas conocidas a su categoria`() {
        assertEquals(idOf("Salud"), ReceiptCategorizer.suggestCategory("FARMACIA GUADALAJARA", categories)?.id)
        assertEquals(idOf("Entretenimiento"), ReceiptCategorizer.suggestCategory("CINEPOLIS PLAZA", categories)?.id)
        assertEquals(idOf("Compras"), ReceiptCategorizer.suggestCategory("LIVERPOOL CENTRO", categories)?.id)
        assertEquals(idOf("Vivienda"), ReceiptCategorizer.suggestCategory("THE HOME DEPOT", categories)?.id)
        assertEquals(idOf("Educación"), ReceiptCategorizer.suggestCategory("LIBRERIA GANDHI", categories)?.id)
        assertEquals(idOf("Servicios"), ReceiptCategorizer.suggestCategory("CFE SUMINISTRADOR", categories)?.id)
    }

    @Test
    fun `tienda desconocida o nula cae en Otros`() {
        assertEquals(idOf("Otros"), ReceiptCategorizer.suggestCategory("TIENDA DESCONOCIDA XYZ", categories)?.id)
        assertEquals(idOf("Otros"), ReceiptCategorizer.suggestCategory(null, categories)?.id)
    }

    @Test
    fun `solo considera categorias de gasto`() {
        val result = ReceiptCategorizer.suggestCategory("WALMART", categories)
        assertEquals(TransactionType.EXPENSE, result?.type)
    }

    // --- CUENTA -----------------------------------------------------------------

    private val accounts = listOf(
        account(1, "Efectivo", AccountType.CASH),
        account(2, "Banco", AccountType.BANK)
    )

    @Test
    fun `la cuenta preferida tiene prioridad`() {
        val result = ReceiptCategorizer.suggestAccount(accounts, preferredAccountId = 2, lastUsedAccountId = 1)
        assertEquals(2L, result?.id)
    }

    @Test
    fun `sin preferida usa la ultima cuenta usada`() {
        val result = ReceiptCategorizer.suggestAccount(accounts, preferredAccountId = null, lastUsedAccountId = 2)
        assertEquals(2L, result?.id)
    }

    @Test
    fun `sin datos prefiere efectivo`() {
        val result = ReceiptCategorizer.suggestAccount(accounts, preferredAccountId = null, lastUsedAccountId = null)
        assertEquals(1L, result?.id)
    }

    @Test
    fun `sin efectivo cae en la primera cuenta`() {
        val noCash = listOf(account(2, "Banco", AccountType.BANK), account(3, "TDC", AccountType.CREDIT_CARD))
        val result = ReceiptCategorizer.suggestAccount(noCash, null, null)
        assertEquals(2L, result?.id)
    }

    @Test
    fun `ids inexistentes se ignoran y se usa el fallback`() {
        val result = ReceiptCategorizer.suggestAccount(accounts, preferredAccountId = 99, lastUsedAccountId = null)
        assertEquals(1L, result?.id) // 99 no existe -> primera CASH
    }

    // --- PRESUPUESTOS -----------------------------------------------------------

    private fun budget(id: Long, name: String, start: Long, end: Long) =
        Budget(id = id, name = name, amount = 1000.0, startDate = start, endDate = end,
            recurrence = BudgetRecurrence.NONE)

    @Test
    fun `preselecciona presupuestos que cubren la fecha y encajan con la categoria`() {
        val date = dateMillis(2024, 3, 15)
        val marzo = budget(1, "Comida marzo", dateMillis(2024, 3, 1), dateMillis(2024, 3, 31))
        val transporte = budget(2, "Transporte", dateMillis(2024, 3, 1), dateMillis(2024, 3, 31))
        val abril = budget(3, "Comida abril", dateMillis(2024, 4, 1), dateMillis(2024, 4, 30))

        val result = ReceiptCategorizer.suggestBudgets(
            budgets = listOf(marzo, transporte, abril),
            date = date,
            category = cat(1, "Comida"),
            merchant = null
        )
        assertEquals(listOf(1L), result)
    }

    @Test
    fun `tambien preselecciona por coincidencia con la tienda`() {
        val date = dateMillis(2024, 3, 15)
        val walmart = budget(4, "Walmart", dateMillis(2024, 3, 1), dateMillis(2024, 3, 31))

        val result = ReceiptCategorizer.suggestBudgets(
            budgets = listOf(walmart),
            date = date,
            category = cat(2, "Transporte"),
            merchant = "WALMART SUPERCENTER"
        )
        assertEquals(listOf(4L), result)
    }

    @Test
    fun `sin coincidencias no preselecciona ninguno`() {
        val date = dateMillis(2024, 3, 15)
        val otro = budget(5, "Vacaciones", dateMillis(2024, 3, 1), dateMillis(2024, 3, 31))
        val result = ReceiptCategorizer.suggestBudgets(listOf(otro), date, cat(1, "Comida"), "OXXO")
        assertTrue(result.isEmpty())
    }

    // --- categorize() integración ----------------------------------------------

    @Test
    fun `categorize combina cuenta categoria y presupuestos`() {
        val date = dateMillis(2024, 3, 15)
        val budgets = listOf(budget(1, "Comida marzo", dateMillis(2024, 3, 1), dateMillis(2024, 3, 31)))
        val suggestion = ReceiptCategorizer.categorize(
            merchant = "WALMART SUPERCENTER",
            date = date,
            categories = categories,
            accounts = accounts,
            budgets = budgets,
            preferredAccountId = null,
            lastUsedAccountId = 2
        )
        assertEquals(idOf("Comida"), suggestion.categoryId)
        assertEquals(2L, suggestion.accountId)
        assertEquals(listOf(1L), suggestion.budgetIds)
    }

    @Test
    fun `sin cuentas no sugiere cuenta`() {
        assertNull(ReceiptCategorizer.suggestAccount(emptyList(), null, null))
    }
}
