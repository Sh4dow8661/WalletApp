package com.walletapp.domain.receipt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

class ReceiptParserTest {

    // --- Helpers ----------------------------------------------------------------

    /** Convierte un texto multilínea en [ReceiptLine]s con `top` incremental. */
    private fun linesOf(raw: String): List<ReceiptLine> =
        raw.trimIndent().lines().mapIndexed { i, t -> ReceiptLine(t, top = i * 10) }

    private fun dateMillis(year: Int, month: Int, day: Int): Long =
        Calendar.getInstance().apply {
            clear(); set(year, month - 1, day, 0, 0, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis

    // --- normalizeAmount --------------------------------------------------------

    @Test
    fun `normaliza formato US con coma de miles y punto decimal`() {
        assertEquals(1234.56, ReceiptParser.normalizeAmount("1,234.56")!!, 0.001)
        assertEquals(1234.56, ReceiptParser.normalizeAmount("\$1,234.56")!!, 0.001)
    }

    @Test
    fun `normaliza formato europeo LATAM con punto de miles y coma decimal`() {
        assertEquals(1234.56, ReceiptParser.normalizeAmount("1.234,56")!!, 0.001)
        assertEquals(1234567.89, ReceiptParser.normalizeAmount("1.234.567,89")!!, 0.001)
    }

    @Test
    fun `distingue separador de miles de decimal segun digitos`() {
        assertEquals(1234.0, ReceiptParser.normalizeAmount("1,234")!!, 0.001) // miles
        assertEquals(1234.0, ReceiptParser.normalizeAmount("1.234")!!, 0.001) // miles
        assertEquals(12.5, ReceiptParser.normalizeAmount("12,50")!!, 0.001)   // decimal
        assertEquals(100.0, ReceiptParser.normalizeAmount("100")!!, 0.001)
    }

    // --- TOTAL ------------------------------------------------------------------

    @Test
    fun `extrae el total e ignora subtotal IVA efectivo y cambio`() {
        val receipt = linesOf(
            """
            WALMART SUPERCENTER
            AV. UNIVERSIDAD 123
            RFC WAL9709244W4
            TEL. 55 1234 5678
            Leche            25.00
            Pan              18.50
            SUBTOTAL        100.00
            IVA              16.00
            TOTAL           116.00
            EFECTIVO        200.00
            CAMBIO           84.00
            FECHA: 15/03/2024
            GRACIAS POR SU COMPRA
            """
        )
        val result = ReceiptParser.parse(receipt)

        assertEquals(116.00, result.total!!, 0.001)
        assertEquals(FieldConfidence.HIGH, result.totalConfidence)
        assertEquals("WALMART SUPERCENTER", result.merchant)
        assertEquals(FieldConfidence.HIGH, result.merchantConfidence)
        assertEquals(dateMillis(2024, 3, 15), result.date)
    }

    @Test
    fun `toma el importe del renglon de abajo y normaliza decimales con coma`() {
        val receipt = linesOf(
            """
            OXXO
            TIENDAS OXXO SA DE CV
            SUBTOTAL
            86,21
            IVA
            13,79
            TOTAL
            100,00
            """
        )
        val result = ReceiptParser.parse(receipt)

        assertEquals(100.00, result.total!!, 0.001)
        assertEquals(FieldConfidence.MEDIUM, result.totalConfidence) // importe en línea contigua
        assertEquals("OXXO", result.merchant)
    }

    @Test
    fun `con varios totales elige el mayor`() {
        val receipt = linesOf(
            """
            RESTAURANTE EL BUEN SABOR
            TOTAL PARCIAL     50.00
            TOTAL A PAGAR    116.00
            """
        )
        val result = ReceiptParser.parse(receipt)
        assertEquals(116.00, result.total!!, 0.001)
    }

    @Test
    fun `sin palabra clave usa el importe mayor con baja confianza`() {
        val receipt = linesOf(
            """
            TIENDA LOCAL
            Producto A 30.00
            Producto B 45.50
            """
        )
        val result = ReceiptParser.parse(receipt)
        assertEquals(45.50, result.total!!, 0.001)
        assertEquals(FieldConfidence.LOW, result.totalConfidence)
    }

    @Test
    fun `sin importes no devuelve total`() {
        val receipt = linesOf(
            """
            TIENDA SIN NUMEROS
            GRACIAS POR SU VISITA
            """
        )
        val result = ReceiptParser.parse(receipt)
        assertNull(result.total)
    }

    @Test
    fun `lista vacia devuelve recibo vacio`() {
        val result = ReceiptParser.parse(emptyList())
        assertTrue(result.isEmpty)
        assertNull(result.total)
        assertNull(result.merchant)
    }

    // --- MERCHANT ---------------------------------------------------------------

    @Test
    fun `salta encabezados de ruido para detectar la tienda`() {
        val receipt = linesOf(
            """
            TICKET DE COMPRA
            SORIANA HIPER
            CALLE FALSA 123
            TOTAL 250.00
            """
        )
        val result = ReceiptParser.parse(receipt)
        assertEquals("SORIANA HIPER", result.merchant)
        // No es la primera línea (saltamos "TICKET DE COMPRA") -> confianza media.
        assertEquals(FieldConfidence.MEDIUM, result.merchantConfidence)
    }

    // --- FECHA ------------------------------------------------------------------

    @Test
    fun `parsea fecha en formato ISO`() {
        val receipt = linesOf(
            """
            TIENDA
            2024-03-15
            TOTAL 10.00
            """
        )
        val result = ReceiptParser.parse(receipt)
        assertEquals(dateMillis(2024, 3, 15), result.date)
        assertEquals(FieldConfidence.HIGH, result.dateConfidence)
    }

    @Test
    fun `parsea fecha dd-MM-yy de dos digitos`() {
        val receipt = linesOf(
            """
            TIENDA
            FECHA 09-04-23
            TOTAL 10.00
            """
        )
        val result = ReceiptParser.parse(receipt)
        assertEquals(dateMillis(2023, 4, 9), result.date)
        assertEquals(FieldConfidence.MEDIUM, result.dateConfidence) // año de 2 dígitos
    }

    @Test
    fun `sin fecha la confianza es baja y la fecha nula`() {
        val receipt = linesOf(
            """
            TIENDA
            TOTAL 10.00
            """
        )
        val result = ReceiptParser.parse(receipt)
        assertNull(result.date)
        assertEquals(FieldConfidence.LOW, result.dateConfidence)
    }

    @Test
    fun `detecta el simbolo de moneda`() {
        val receipt = linesOf(
            """
            TIENDA
            TOTAL ${'$'}116.00 MXN
            """
        )
        val result = ReceiptParser.parse(receipt)
        assertNotNull(result.currencyRaw)
    }
}
