package com.walletapp.data.ml

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

/**
 * Gestiona la foto temporal del recibo en `cacheDir/receipts` (reutilizando el
 * FileProvider existente, authority `${applicationId}.fileprovider`) y carga
 * bitmaps re-escalados y rotados según EXIF, tanto para el OCR como para la
 * miniatura de la pantalla de revisión.
 */
object ReceiptImageStore {

    private const val DIR = "receipts"

    private fun cacheDir(context: Context): File =
        File(context.cacheDir, DIR).apply { mkdirs() }

    /** Crea un Uri (vía FileProvider) donde la cámara escribirá la foto. */
    fun createCaptureUri(context: Context): Uri {
        val file = File(cacheDir(context), "receipt_${System.currentTimeMillis()}.jpg")
        return FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
    }

    /** Borra las fotos temporales de recibos para no dejar basura en caché. */
    fun clearCache(context: Context) {
        runCatching { cacheDir(context).listFiles()?.forEach { it.delete() } }
    }

    /**
     * Decodifica el bitmap de [uri] re-escalado para que su dimensión mayor no
     * supere [maxDimension] (controla memoria y acelera el OCR) y lo rota según
     * la orientación EXIF. Devuelve null si la imagen no se puede leer.
     */
    fun loadBitmap(context: Context, uri: Uri, maxDimension: Int): Bitmap? {
        val resolver = context.contentResolver

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        // OJO: con inJustDecodeBounds=true, decodeStream SIEMPRE devuelve null (solo
        // rellena outWidth/outHeight). Por eso el null se evalúa sobre openInputStream
        // —si no, loadBitmap devolvería null para CUALQUIER imagen válida y el OCR
        // fallaría siempre con "no se pudo leer la imagen".
        (resolver.openInputStream(uri) ?: return null).use {
            BitmapFactory.decodeStream(it, null, bounds)
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (bounds.outWidth / sample > maxDimension || bounds.outHeight / sample > maxDimension) {
            sample *= 2
        }

        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        } ?: return null

        val rotation = readRotationDegrees(context, uri)
        if (rotation == 0) return bitmap

        val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            .also { rotated -> if (rotated != bitmap) bitmap.recycle() }
    }

    private fun readRotationDegrees(context: Context, uri: Uri): Int = try {
        context.contentResolver.openInputStream(uri)?.use { input ->
            when (ExifInterface(input).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            )) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90
                ExifInterface.ORIENTATION_ROTATE_180 -> 180
                ExifInterface.ORIENTATION_ROTATE_270 -> 270
                else -> 0
            }
        } ?: 0
    } catch (_: Exception) {
        0
    }
}
