package com.walletapp.domain.receipt

import java.text.Normalizer

/**
 * Normaliza texto para comparaciones robustas: lo pasa a MAYÚSCULAS, le quita
 * acentos/diacríticos y colapsa los espacios. Compartido por [ReceiptParser] y
 * [ReceiptCategorizer]. Es Kotlin puro (JVM) para poder testearse sin Android.
 */
internal fun normalizeForMatching(text: String): String =
    Normalizer.normalize(text, Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .uppercase()
        .replace(Regex("\\s+"), " ")
        .trim()

/**
 * Nivel de confianza con el que se extrajo un campo del recibo. La UI usa esto
 * para resaltar en ámbar los datos dudosos que conviene revisar.
 */
enum class FieldConfidence { HIGH, MEDIUM, LOW }

/**
 * Una línea de texto reconocida en el recibo. Es una abstracción independiente
 * de ML Kit para que [ReceiptParser] sea Kotlin puro y unit-testeable sin Android.
 *
 * @param text texto de la línea (ya recortado).
 * @param top  coordenada Y del borde superior del bounding box, usada para ordenar
 *             de arriba a abajo. Cuando no se conoce (p. ej. en tests) puede usarse
 *             el índice de lectura; el orden de inserción se mantiene como desempate.
 */
data class ReceiptLine(
    val text: String,
    val top: Int = 0
)

/**
 * Resultado de parsear un recibo. Los campos nulos indican que no se pudo extraer
 * el dato. Cada campo lleva su [FieldConfidence] asociada.
 */
data class ParsedReceipt(
    val merchant: String? = null,
    val total: Double? = null,
    /** Fecha del ticket en epoch millis (medianoche local), o null si no se halló. */
    val date: Long? = null,
    /** Símbolo o código de moneda detectado junto al total (p. ej. "$", "MXN", "€"). */
    val currencyRaw: String? = null,
    val merchantConfidence: FieldConfidence = FieldConfidence.LOW,
    val totalConfidence: FieldConfidence = FieldConfidence.LOW,
    val dateConfidence: FieldConfidence = FieldConfidence.LOW
) {
    /** True cuando no se detectó ni tienda ni total (foto borrosa o sin texto útil). */
    val isEmpty: Boolean get() = merchant == null && total == null
}
