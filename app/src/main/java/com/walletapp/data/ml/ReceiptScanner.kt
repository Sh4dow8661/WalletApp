package com.walletapp.data.ml

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.walletapp.domain.receipt.ReceiptLine
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Se lanza cuando el OCR no encuentra texto utilizable en la imagen. */
class ReceiptScanException(message: String) : Exception(message)

/**
 * Corre OCR on-device con ML Kit Text Recognition v2 (variante *bundled*: el
 * modelo viaja en el APK y se ejecuta en el dispositivo, sin red ni Play
 * Services). Convierte la imagen del recibo en una lista de [ReceiptLine] que
 * luego procesa `ReceiptParser`.
 */
@Singleton
class ReceiptScanner @Inject constructor(
    @ApplicationContext private val context: Context
) {

    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    suspend fun scan(uri: Uri): List<ReceiptLine> {
        val bitmap = withContext(Dispatchers.IO) {
            ReceiptImageStore.loadBitmap(context, uri, MAX_OCR_DIMENSION)
        } ?: throw ReceiptScanException("No se pudo leer la imagen del recibo")

        try {
            val image = InputImage.fromBitmap(bitmap, 0) // ya rotado al cargar
            val text = recognizer.process(image).await()
            return text.textBlocks
                .flatMap { block -> block.lines }
                .map { line -> ReceiptLine(text = line.text, top = line.boundingBox?.top ?: 0) }
        } finally {
            bitmap.recycle()
        }
    }

    companion object {
        /** Dimensión máxima (px) a la que se re-escala la foto antes del OCR. */
        private const val MAX_OCR_DIMENSION = 1600
    }
}

/** Adapta un [Task] de ML Kit/GMS a una corrutina suspendida y cancelable. */
private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { cont ->
    addOnSuccessListener { result -> cont.resume(result) }
    addOnFailureListener { e -> cont.resumeWithException(e) }
    addOnCanceledListener { cont.cancel() }
}
