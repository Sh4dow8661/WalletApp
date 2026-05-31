package com.walletapp.domain.receipt

import com.walletapp.domain.model.Account
import com.walletapp.domain.model.AccountType
import com.walletapp.domain.model.Budget
import com.walletapp.domain.model.BudgetPeriod
import com.walletapp.domain.model.Category
import com.walletapp.domain.model.TransactionType

/**
 * Sugiere CUENTA, CATEGORÍA y PRESUPUESTO(s) para un recibo a partir de reglas
 * locales (heurísticas), sin IA ni red. Es Kotlin puro y unit-testeable.
 *
 * El diccionario [MERCHANT_KEYWORDS] empareja palabras clave de la tienda con el
 * nombre de una categoría real (los de `DefaultData`). Para ampliarlo basta con
 * añadir palabras a la lista de la categoría correspondiente. El orden importa:
 * la primera categoría con una coincidencia gana (las más específicas van antes
 * que las genéricas; p. ej. "OXXO GAS" → Transporte y "OXXO" → Comida).
 */
object ReceiptCategorizer {

    data class Suggestion(
        val categoryId: Long?,
        val accountId: Long?,
        val budgetIds: List<Long>
    )

    /** Nombre de la categoría usada como último recurso si nada coincide. */
    const val FALLBACK_CATEGORY_NAME = "Otros"

    /**
     * Diccionario ordenado tienda → categoría. La clave es el nombre canónico de
     * la categoría (como en `DefaultData`); el valor, las palabras clave a buscar
     * dentro del nombre de la tienda (sin acentos y en minúsculas da igual: la
     * comparación es normalizada).
     */
    val MERCHANT_KEYWORDS: List<Pair<String, List<String>>> = listOf(
        "Transporte" to listOf(
            // Nota: evitamos palabras muy cortas como "ado" (ADO) porque casan con
            // el sufijo -ado de muchas palabras (MERCADO, PESCADO, SUMINISTRADOR...).
            "oxxo gas", "pemex", "gasolin", "combustible", "shell", "mobil",
            "repsol", "uber", "didi", "cabify", "taxi", "estacionamiento",
            "parking", "caseta", "peaje", "autobus"
        ),
        "Salud" to listOf(
            "farmacia", "farmacias", "benavides", "similares", "hospital",
            "clinica", "medico", "dentista", "laboratorio", "optica", "gimnasio", "gym"
        ),
        "Servicios" to listOf(
            "cfe", "telmex", "telcel", "movistar", "att", "izzi", "totalplay",
            "megacable", "dish", "recarga", "recibo de luz", "predial"
        ),
        "Entretenimiento" to listOf(
            "cinepolis", "cinemex", "cinema", "netflix", "spotify", "hbo",
            "disney", "steam", "playstation", "xbox", "nintendo", "teatro"
        ),
        "Educación" to listOf(
            "libreria", "papeleria", "universidad", "colegio", "escuela",
            "instituto", "gandhi", "porrua"
        ),
        "Vivienda" to listOf(
            "home depot", "ferreteria", "construrama", "truper", "muebleria",
            "muebles", "ikea"
        ),
        "Compras" to listOf(
            "liverpool", "palacio", "coppel", "elektra", "sears", "suburbia",
            "zara", "bershka", "amazon", "mercado libre", "mercadolibre",
            "shein", "best buy", "office depot"
        ),
        "Comida" to listOf(
            // Supermercados / tiendas de conveniencia
            "walmart", "soriana", "bodega aurrera", "aurrera", "chedraui", "heb",
            "h-e-b", "costco", "sams", "superama", "la comer", "comercial mexicana",
            "supermercado", "abarrotes", "oxxo", "7-eleven", "seven eleven",
            "kiosko", "circle k", "fruteria", "carniceria", "panaderia", "tortilleria",
            // Restaurantes / cafeterías
            "restaurante", "taqueria", "tacos", "pizza", "dominos", "little caesars",
            "burger", "mcdonald", "kfc", "subway", "starbucks", "cafe", "coffee",
            "vips", "toks", "sushi", "cocina", "fonda", "marisco", "cantina"
        )
    )

    fun categorize(
        merchant: String?,
        date: Long,
        categories: List<Category>,
        accounts: List<Account>,
        budgets: List<Budget>,
        preferredAccountId: Long? = null,
        lastUsedAccountId: Long? = null
    ): Suggestion {
        val category = suggestCategory(merchant, categories)
        val account = suggestAccount(accounts, preferredAccountId, lastUsedAccountId)
        val budgetIds = suggestBudgets(budgets, date, category, merchant)
        return Suggestion(
            categoryId = category?.id,
            accountId = account?.id,
            budgetIds = budgetIds
        )
    }

    // --- CATEGORÍA --------------------------------------------------------------

    fun suggestCategory(merchant: String?, categories: List<Category>): Category? {
        val expense = categories.filter { it.type == TransactionType.EXPENSE }
        if (expense.isEmpty()) return null

        val normMerchant = merchant?.let { normalizeForMatching(it) }.orEmpty()
        if (normMerchant.isNotEmpty()) {
            // 1) Diccionario tienda → categoría (la primera coincidencia gana).
            for ((categoryName, keywords) in MERCHANT_KEYWORDS) {
                if (keywords.any { normMerchant.contains(normalizeForMatching(it)) }) {
                    findByName(expense, categoryName)?.let { return it }
                }
            }
            // 2) El nombre real de una categoría aparece en el de la tienda.
            expense.firstOrNull { normMerchant.contains(normalizeForMatching(it.name)) }
                ?.let { return it }
        }

        // 3) Fallback razonable: "Otros" o la primera categoría de gasto.
        return findByName(expense, FALLBACK_CATEGORY_NAME) ?: expense.first()
    }

    private fun findByName(categories: List<Category>, name: String): Category? {
        val target = normalizeForMatching(name)
        return categories.firstOrNull { normalizeForMatching(it.name) == target }
    }

    // --- CUENTA -----------------------------------------------------------------

    /**
     * Regla simple y predecible: la cuenta por defecto de escaneos (ajuste), si
     * no la última usada en un gasto, si no la primera (prefiriendo efectivo).
     */
    fun suggestAccount(
        accounts: List<Account>,
        preferredAccountId: Long?,
        lastUsedAccountId: Long?
    ): Account? {
        if (accounts.isEmpty()) return null
        preferredAccountId?.let { id -> accounts.firstOrNull { it.id == id } }?.let { return it }
        lastUsedAccountId?.let { id -> accounts.firstOrNull { it.id == id } }?.let { return it }
        return accounts.firstOrNull { it.type == AccountType.CASH } ?: accounts.first()
    }

    // --- PRESUPUESTOS -----------------------------------------------------------

    /**
     * Pre-selecciona los presupuestos cuyo período cubre la fecha del ticket y
     * cuyo nombre encaja con la categoría sugerida o con la tienda. Si nada
     * coincide, ninguno (siempre editable en la pantalla de revisión).
     */
    fun suggestBudgets(
        budgets: List<Budget>,
        date: Long,
        category: Category?,
        merchant: String?
    ): List<Long> {
        if (budgets.isEmpty()) return emptyList()
        val normCategory = category?.let { normalizeForMatching(it.name) }
        val normMerchant = merchant?.let { normalizeForMatching(it) }

        return budgets.filter { budget ->
            if (!periodCovers(budget, date)) return@filter false
            val budgetName = normalizeForMatching(budget.name)
            if (budgetName.isEmpty()) return@filter false

            val matchesCategory = normCategory != null &&
                (budgetName.contains(normCategory) || normCategory.contains(budgetName))
            val matchesMerchant = !normMerchant.isNullOrEmpty() &&
                (normMerchant.contains(budgetName) || budgetName.contains(normMerchant))

            matchesCategory || matchesMerchant
        }.map { it.id }
    }

    private fun periodCovers(budget: Budget, date: Long): Boolean {
        val (start, end) = BudgetPeriod.currentPeriod(
            startDate = budget.startDate,
            endDate = budget.endDate,
            recurrence = budget.recurrence,
            now = date
        )
        return date in start..end
    }
}
