package com.walletapp.util

import android.content.Context
import com.walletapp.data.local.dao.ExportDao
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.TimeZone

/**
 * Vuelca la base entera a un JSON, para migrar los datos a la PWA (§12).
 *
 * ## Por qué existe además del CSV
 *
 * El CSV solo lleva transacciones, y ni siquiera completas. Se pierden:
 * presupuestos, los enlaces transacción↔presupuesto, los balances iniciales de
 * las cuentas, colores, iconos, `includeInTotal` y —lo más traicionero— la
 * **dirección de las transferencias**, porque no exporta `isOutgoing`: al
 * reimportar no hay forma de saber cuál de las dos filas era la que salía.
 *
 * Este volcado incluye las cinco tablas tal cual están, con sus identificadores
 * originales, así que la importación puede reconstruirlo todo sin adivinar nada.
 *
 * Se usa `org.json`, que viene con Android: añadir una librería de serialización
 * a una app que ya no se va a tocar más no compensa.
 */
object JsonExporter {

    /** Sube cuando cambie la forma del archivo, para que el importador lo sepa. */
    const val FORMAT_VERSION = 1

    suspend fun export(
        context: Context,
        exportDao: ExportDao,
        currency: String,
        appVersionName: String,
        databaseVersion: Int
    ): File {
        val root = JSONObject().apply {
            put("formato", "walletapp-export")
            put("version", FORMAT_VERSION)
            put("exportadoEn", System.currentTimeMillis())
            // La zona del dispositivo importa: las fechas son epoch millis, y al
            // importarlas hay que saber en qué huso se eligieron para que el día
            // no se corra (§8.6).
            put("zonaHoraria", TimeZone.getDefault().id)
            put("moneda", currency)
            put("app", JSONObject().apply {
                put("versionName", appVersionName)
                put("dbVersion", databaseVersion)
            })
        }

        root.put("cuentas", JSONArray().apply {
            exportDao.allAccounts().forEach { a ->
                put(JSONObject().apply {
                    put("id", a.id)
                    put("name", a.name)
                    put("type", a.type)
                    put("initialBalance", a.initialBalance)
                    put("colorHex", a.colorHex)
                    put("iconName", a.iconName)
                    put("includeInTotal", a.includeInTotal)
                })
            }
        })

        root.put("categorias", JSONArray().apply {
            exportDao.allCategories().forEach { c ->
                put(JSONObject().apply {
                    put("id", c.id)
                    put("name", c.name)
                    put("type", c.type)
                    put("iconName", c.iconName)
                    put("colorHex", c.colorHex)
                    put("isDefault", c.isDefault)
                })
            }
        })

        root.put("transacciones", JSONArray().apply {
            exportDao.allTransactions().forEach { t ->
                put(JSONObject().apply {
                    put("id", t.id)
                    put("amount", t.amount)
                    put("type", t.type)
                    // `JSONObject.put` con null borra la clave, así que los
                    // opcionales se escriben explícitamente como JSONObject.NULL.
                    put("categoryId", t.categoryId ?: JSONObject.NULL)
                    put("accountId", t.accountId)
                    put("transferAccountId", t.transferAccountId ?: JSONObject.NULL)
                    put("note", t.note)
                    put("date", t.date)
                    // La pieza que el CSV no guarda y sin la cual no se puede
                    // saber la dirección de una transferencia.
                    put("isOutgoing", t.isOutgoing)
                })
            }
        })

        root.put("presupuestos", JSONArray().apply {
            exportDao.allBudgets().forEach { b ->
                put(JSONObject().apply {
                    put("id", b.id)
                    put("name", b.name)
                    put("amount", b.amount)
                    put("startDate", b.startDate)
                    put("endDate", b.endDate)
                    put("recurrence", b.recurrence)
                })
            }
        })

        root.put("enlaces", JSONArray().apply {
            exportDao.allTransactionBudgetRefs().forEach { r ->
                put(JSONObject().apply {
                    put("transactionId", r.transactionId)
                    put("budgetId", r.budgetId)
                })
            }
        })

        val dir = File(context.getExternalFilesDir(null), "exports")
        if (!dir.exists()) dir.mkdirs()
        val file = File(dir, "wallet_export_${System.currentTimeMillis()}.json")
        file.writeText(root.toString(2))
        return file
    }
}
