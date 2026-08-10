package com.walletapp.domain.receipt

import java.util.Calendar

/**
 * Extrae TIENDA, TOTAL y FECHA del texto de un recibo (tickets en español/MX y
 * formatos US/LATAM). Es Kotlin puro y sin dependencias de Android para poder
 * testearlo con JUnit: recibe una lista de [ReceiptLine] (que el adaptador de ML
 * Kit construye a partir de los bloques/líneas con bounding boxes).
 *
 * Reglas resumidas:
 * - TOTAL: líneas con TOTAL / TOTAL A PAGAR / IMPORTE / MONTO; ignora SUBTOTAL,
 *   IVA, CAMBIO, EFECTIVO, PROPINA, etc. Toma el importe del mismo renglón o el
 *   más cercano debajo. Si hay varios "total" prioriza el mayor (y, a igualdad,
 *   el que está más abajo). Normaliza `1,234.56` y `1.234,56`.
 * - TIENDA: primeras líneas no vacías de arriba; descarta dirección, RFC,
 *   teléfono, web o encabezados como "TICKET"/"FACTURA".
 * - FECHA: regex dd/MM/yyyy, dd-MM-yy, yyyy-MM-dd, etc. Si no hay, devuelve null
 *   (el llamador usa la fecha actual).
 */
object ReceiptParser {

    // --- Diccionarios de palabras clave (mayúsculas y sin acentos) --------------

    /** Palabras que marcan el total a pagar. */
    private val TOTAL_KEYWORDS = listOf(
        "TOTAL A PAGAR", "IMPORTE TOTAL", "GRAN TOTAL", "TOTAL VENTA",
        "TOTAL COMPRA", "A PAGAR", "TOTAL", "IMPORTE", "MONTO"
    )

    /**
     * Si una línea contiene alguna de estas, NO es el total aunque contenga la
     * palabra "TOTAL" (p. ej. SUBTOTAL) o un importe (IVA, CAMBIO, EFECTIVO...).
     */
    private val TOTAL_NEGATIVE_KEYWORDS = listOf(
        "SUBTOTAL", "SUB TOTAL", "SUB-TOTAL",
        "IVA", "I.V.A", "IEPS", "IMPUESTO",
        "CAMBIO", "SU CAMBIO", "CHANGE",
        "EFECTIVO", "CASH", "TARJETA", "PAGO", "RECIBIDO", "PAGADO",
        "PROPINA", "TIP",
        "DESCUENTO", "AHORRO", "AHORRASTE", "PUNTOS", "REDONDEO",
        "ARTICULOS", "ARTICULO", "ITEMS", "PIEZAS", "PZAS",
        "CANTIDAD", "UNIDADES", "PRODUCTOS"
    )

    /** Encabezados/pies que nunca son el nombre de la tienda. */
    private val MERCHANT_NOISE_KEYWORDS = listOf(
        "TICKET", "FACTURA", "NOTA DE VENTA", "NOTA DE COMPRA", "COMPROBANTE",
        "RECIBO", "ORDEN", "FOLIO", "CAJA", "CAJERO", "SUCURSAL", "MESA",
        "RFC", "REGIMEN", "TEL", "TELEFONO", "FECHA", "HORA", "CLIENTE",
        "GRACIAS", "VUELVA", "BIENVENIDO", "WWW", "HTTP", ".COM", "@",
        "CALLE", "AVENIDA", "AV.", "AV ", "BLVD", "COL.", "COLONIA",
        "C.P.", "CP ", "CARRETERA", "KM ", "No.", "NUM.", "DELEG", "MUNICIPIO"
    )

    // --- Regex ------------------------------------------------------------------

    /** Cualquier secuencia numérica con separadores: 1,234.56 / 1.234,56 / 100 / 3.50 */
    private val AMOUNT_TOKEN = Regex("""\d[\d.,]*\d|\d""")

    /** RFC mexicano (persona física/moral). */
    private val RFC_REGEX = Regex("""[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}""")

    /** Una corrida de 7+ dígitos seguidos parece teléfono/folio, no una tienda. */
    private val LONG_DIGITS = Regex("""\d{7,}""")

    private val DATE_ISO = Regex("""(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})""")
    private val DATE_DMY = Regex("""(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})""")

    // ---------------------------------------------------------------------------

    fun parse(lines: List<ReceiptLine>): ParsedReceipt {
        val clean = lines
            .map { it.copy(text = it.text.trim()) }
            .filter { it.text.isNotEmpty() }
            .sortedBy { it.top } // ML Kit ya viene ordenado; esto refuerza arriba→abajo

        if (clean.isEmpty()) return ParsedReceipt()

        val (total, totalConfidence, currencyRaw) = extractTotal(clean)
        val (merchant, merchantConfidence) = extractMerchant(clean)
        val (date, dateConfidence) = extractDate(clean)

        return ParsedReceipt(
            merchant = merchant,
            total = total,
            date = date,
            currencyRaw = currencyRaw,
            merchantConfidence = merchantConfidence,
            totalConfidence = totalConfidence,
            dateConfidence = dateConfidence
        )
    }

    // --- TOTAL ------------------------------------------------------------------

    private data class TotalCandidate(
        val amount: Double,
        val index: Int,
        val sameLine: Boolean,
        val currency: String?
    )

    private fun extractTotal(lines: List<ReceiptLine>): Triple<Double?, FieldConfidence, String?> {
        val candidates = mutableListOf<TotalCandidate>()

        lines.forEachIndexed { index, line ->
            val norm = normalize(line.text)
            val isNegative = TOTAL_NEGATIVE_KEYWORDS.any { norm.contains(it) }
            val isTotal = TOTAL_KEYWORDS.any { norm.contains(it) }
            if (!isTotal || isNegative) return@forEachIndexed

            val sameLineAmounts = findAmounts(line.text)
            if (sameLineAmounts.isNotEmpty()) {
                candidates += TotalCandidate(
                    amount = sameLineAmounts.max(),
                    index = index,
                    sameLine = true,
                    currency = detectCurrency(line.text)
                )
            } else {
                // El importe puede ir en el renglón inmediato de abajo.
                for (next in (index + 1)..minOf(index + 2, lines.lastIndex)) {
                    val amounts = findAmounts(lines[next].text)
                    if (amounts.isNotEmpty()) {
                        candidates += TotalCandidate(
                            amount = amounts.max(),
                            index = next,
                            sameLine = false,
                            currency = detectCurrency(lines[next].text)
                        )
                        break
                    }
                }
            }
        }

        if (candidates.isNotEmpty()) {
            // Prioriza el importe mayor; a igualdad, el que esté más abajo.
            val best = candidates.maxWith(
                compareBy<TotalCandidate> { it.amount }.thenBy { it.index }
            )
            val confidence = if (best.sameLine) FieldConfidence.HIGH else FieldConfidence.MEDIUM
            return Triple(best.amount, confidence, best.currency)
        }

        // Sin palabra clave: el total suele ser el importe (con separador) más grande.
        val moneyAmounts = lines.flatMap { line -> findAmounts(line.text, requireSeparator = true) }
        val fallback = moneyAmounts.maxOrNull()
        val currency = lines.firstNotNullOfOrNull { detectCurrency(it.text) }
        return Triple(fallback, FieldConfidence.LOW, currency)
    }

    /**
     * Devuelve los importes positivos encontrados en una línea. Si [requireSeparator]
     * es true solo considera tokens con `.`/`,` (para descartar cantidades,
     * teléfonos o folios cuando buscamos un total por descarte).
     */
    private fun findAmounts(text: String, requireSeparator: Boolean = false): List<Double> =
        AMOUNT_TOKEN.findAll(text)
            .map { it.value }
            .filter { !requireSeparator || it.contains('.') || it.contains(',') }
            .mapNotNull { normalizeAmount(it) }
            .filter { it > 0.0 }
            .toList()

    /**
     * Normaliza un token numérico a Double soportando formato US (`1,234.56`) y
     * europeo/LATAM (`1.234,56`). Heurística: el último separador es el decimal
     * solo si lo siguen 1–2 dígitos; en otro caso es separador de miles.
     */
    fun normalizeAmount(token: String): Double? {
        val s = token.filter { it.isDigit() || it == '.' || it == ',' }
        if (s.none { it.isDigit() }) return null

        val lastSep = s.lastIndexOfAny(charArrayOf('.', ','))
        if (lastSep == -1) return s.toDoubleOrNull()

        val decimalsAfter = s.length - lastSep - 1
        return if (decimalsAfter in 1..2) {
            val intPart = s.substring(0, lastSep).replace(".", "").replace(",", "")
            val decPart = s.substring(lastSep + 1)
            "${intPart.ifEmpty { "0" }}.$decPart".toDoubleOrNull()
        } else {
            // Último separador es de miles (p. ej. "1.234" o "1,234,567").
            s.replace(".", "").replace(",", "").toDoubleOrNull()
        }
    }

    private fun detectCurrency(text: String): String? {
        val upper = text.uppercase()
        return when {
            text.contains("€") -> "€"
            upper.contains("MXN") -> "MXN"
            upper.contains("USD") -> "USD"
            upper.contains("EUR") -> "EUR"
            text.contains("$") -> "$"
            else -> null
        }
    }

    // --- TIENDA -----------------------------------------------------------------

    private fun extractMerchant(lines: List<ReceiptLine>): Pair<String?, FieldConfidence> {
        val top = lines.take(6)
        top.forEachIndexed { index, line ->
            if (!isMerchantNoise(line.text)) {
                val name = line.text.replace(Regex("\\s+"), " ").trim()
                val confidence = if (index == 0) FieldConfidence.HIGH else FieldConfidence.MEDIUM
                return name to confidence
            }
        }
        // Último recurso: la primera línea, aunque parezca ruido.
        return top.firstOrNull()?.text?.trim() to FieldConfidence.LOW
    }

    private fun isMerchantNoise(text: String): Boolean {
        val norm = normalize(text)
        if (norm.length < 2) return true
        if (RFC_REGEX.containsMatchIn(text.uppercase())) return true
        if (LONG_DIGITS.containsMatchIn(text)) return true
        if (MERCHANT_NOISE_KEYWORDS.any { norm.contains(it) }) return true
        // Mayoría de dígitos/símbolos (direcciones, importes, fechas sueltas).
        val letters = norm.count { it.isLetter() }
        val digits = norm.count { it.isDigit() }
        return letters < 2 || digits > letters
    }

    // --- FECHA ------------------------------------------------------------------

    private fun extractDate(lines: List<ReceiptLine>): Pair<Long?, FieldConfidence> {
        val text = lines.joinToString("\n") { it.text }

        DATE_ISO.find(text)?.let { m ->
            val (y, mo, d) = m.destructured
            buildDate(d.toInt(), mo.toInt(), y.toInt())?.let { return it to FieldConfidence.HIGH }
        }

        DATE_DMY.find(text)?.let { m ->
            val (a, b, c) = m.destructured
            var day = a.toInt()
            var month = b.toInt()
            // Formato LATAM dd/MM; si el mes no es válido, intenta MM/dd (US).
            if (month > 12 && day <= 12) {
                val tmp = day; day = month; month = tmp
            }
            val year = expandYear(c)
            buildDate(day, month, year)?.let {
                val confidence = if (c.length == 4) FieldConfidence.HIGH else FieldConfidence.MEDIUM
                return it to confidence
            }
        }

        return null to FieldConfidence.LOW
    }

    private fun expandYear(raw: String): Int {
        val n = raw.toInt()
        return if (raw.length == 2) 2000 + n else n
    }

    private fun buildDate(day: Int, month: Int, year: Int): Long? {
        if (month !in 1..12 || day !in 1..31 || year !in 1970..2100) return null
        return Calendar.getInstance().apply {
            clear()
            set(year, month - 1, day, 0, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
    }

    // --- Utilidades -------------------------------------------------------------

    /** Mayúsculas y sin acentos, para comparar palabras clave de forma robusta. */
    private fun normalize(text: String): String = normalizeForMatching(text)
}
