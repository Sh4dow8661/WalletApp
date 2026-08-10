package com.walletapp.ui.screens.scanreceipt

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.walletapp.data.ml.ReceiptImageStore
import com.walletapp.domain.receipt.FieldConfidence
import com.walletapp.ui.components.CategoryIconCircle
import com.walletapp.ui.theme.WarningAmber
import com.walletapp.util.DateUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanReceiptScreen(
    onBack: () -> Unit,
    onManualEntry: () -> Unit,
    viewModel: ScanReceiptViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(state.saved) {
        if (state.saved) onBack()
    }

    // Al salir de la pantalla limpiamos las fotos temporales del recibo.
    DisposableEffect(Unit) {
        onDispose { ReceiptImageStore.clearCache(context) }
    }

    // rememberSaveable: la app de cámara puede recrear esta Activity (memoria baja /
    // "no mantener actividades"); con remember perderíamos el Uri y la foto tomada se
    // descartaría en silencio. Uri es Parcelable, así que sobrevive al savedState.
    var pendingCameraUri by rememberSaveable { mutableStateOf<Uri?>(null) }
    var cameraDenied by remember { mutableStateOf(false) }

    val takePicture = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        val uri = pendingCameraUri
        if (success && uri != null) viewModel.onImageCaptured(uri)
        // Si se cancela (success=false) seguimos en captura; el temporal se limpia al salir.
    }

    fun launchCamera() {
        val uri = ReceiptImageStore.createCaptureUri(context)
        pendingCameraUri = uri
        takePicture.launch(uri)
    }

    val requestCameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            cameraDenied = false
            launchCamera()
        } else {
            cameraDenied = true
        }
    }

    fun onTakePhoto() {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) launchCamera() else requestCameraPermission.launch(Manifest.permission.CAMERA)
    }

    val pickImage = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) viewModel.onImageCaptured(uri)
    }

    fun onPickFromGallery() {
        pickImage.launch(
            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Escanear recibo") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Atrás")
                    }
                }
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (state.stage) {
                ScanStage.CAPTURE -> CaptureContent(
                    cameraDenied = cameraDenied,
                    onTakePhoto = ::onTakePhoto,
                    onPickFromGallery = ::onPickFromGallery
                )
                ScanStage.ANALYZING -> AnalyzingContent(imageUri = state.receiptImageUri)
                ScanStage.REVIEW -> ReviewContent(
                    state = state,
                    viewModel = viewModel,
                    onRetake = viewModel::retake,
                    onManualEntry = onManualEntry
                )
                ScanStage.ERROR -> ErrorContent(
                    message = state.errorMessage,
                    onRetake = viewModel::retake,
                    onManualEntry = onManualEntry
                )
            }
        }
    }
}

@Composable
private fun CaptureContent(
    cameraDenied: Boolean,
    onTakePhoto: () -> Unit,
    onPickFromGallery: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            Icons.Default.PhotoCamera,
            contentDescription = null,
            modifier = Modifier.size(72.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Text(
            "Escanea el ticket y te sugerimos la tienda, el total y la categoría.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            "El reconocimiento de texto es 100% local: nada sale de tu teléfono.",
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(8.dp))
        Button(onClick = onTakePhoto, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.PhotoCamera, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text("Tomar foto")
        }
        OutlinedButton(onClick = onPickFromGallery, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.PhotoLibrary, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text("Elegir de galería")
        }
        if (cameraDenied) {
            FieldWarning(
                "Permiso de cámara denegado. Habilítalo en Ajustes o elige una foto de la galería."
            )
        }
    }
}

@Composable
private fun AnalyzingContent(imageUri: Uri?) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        ReceiptThumbnail(uri = imageUri, heightDp = 220)
        CircularProgressIndicator()
        Text("Analizando…", style = MaterialTheme.typography.titleMedium)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReviewContent(
    state: ScanReceiptState,
    viewModel: ScanReceiptViewModel,
    onRetake: () -> Unit,
    onManualEntry: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        ReceiptThumbnail(uri = state.receiptImageUri, heightDp = 160)

        // Monto (total detectado)
        val amountDubious = state.amountConfidence != FieldConfidence.HIGH
        OutlinedTextField(
            value = state.amount,
            onValueChange = { v -> if (v.isEmpty() || v.toDoubleOrNull() != null) viewModel.setAmount(v) },
            label = { Text("Monto") },
            prefix = state.currencyRaw?.let { { Text("$it ") } },
            singleLine = true,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = KeyboardType.Decimal
            ),
            colors = amberColorsIf(amountDubious),
            modifier = Modifier.fillMaxWidth()
        )
        if (amountDubious) {
            FieldWarning(
                if (state.amount.isEmpty()) "No detectamos el total. Escríbelo a mano."
                else "Verifica el total detectado."
            )
        }

        // Tienda -> nota
        OutlinedTextField(
            value = state.merchant,
            onValueChange = viewModel::setMerchant,
            label = { Text("Tienda (nota)") },
            singleLine = true,
            colors = amberColorsIf(state.merchantConfidence == FieldConfidence.LOW),
            modifier = Modifier.fillMaxWidth()
        )
        if (state.merchantConfidence != FieldConfidence.HIGH) {
            FieldWarning("Revisa el nombre de la tienda.")
        }

        // Cuenta
        SectionTitle("Cuenta")
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            state.accounts.forEach { account ->
                FilterChip(
                    selected = state.accountId == account.id,
                    onClick = { viewModel.setAccount(account.id) },
                    label = { Text(account.name) }
                )
            }
        }

        // Categoría (solo gastos)
        SectionTitle("Categoría")
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            state.expenseCategories.forEach { cat ->
                FilterChip(
                    selected = state.categoryId == cat.id,
                    onClick = { viewModel.setCategory(cat.id) },
                    label = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CategoryIconCircle(iconName = cat.iconName, colorHex = cat.colorHex, size = 24)
                            Spacer(Modifier.size(4.dp))
                            Text(cat.name)
                        }
                    }
                )
            }
        }

        // Presupuestos
        if (state.budgets.isNotEmpty()) {
            SectionTitle("Aplicar a presupuestos")
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                state.budgets.forEach { budget ->
                    FilterChip(
                        selected = budget.id in state.selectedBudgetIds,
                        onClick = { viewModel.toggleBudget(budget.id) },
                        label = { Text(budget.name) }
                    )
                }
            }
        }

        // Fecha
        SectionTitle("Fecha")
        ScanDateSelector(date = state.date, onDateChange = viewModel::setDate)
        if (state.dateConfidence == FieldConfidence.LOW) {
            FieldWarning("No detectamos la fecha del ticket; revisa que sea correcta.")
        }

        state.saveError?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        Button(onClick = viewModel::save, modifier = Modifier.fillMaxWidth()) {
            Text("Guardar")
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(onClick = onRetake, modifier = Modifier.weight(1f)) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.size(4.dp))
                Text("Volver a tomar")
            }
            OutlinedButton(onClick = onManualEntry, modifier = Modifier.weight(1f)) {
                Icon(Icons.Default.Edit, contentDescription = null)
                Spacer(Modifier.size(4.dp))
                Text("Manual")
            }
        }
    }
}

@Composable
private fun ErrorContent(
    message: String?,
    onRetake: () -> Unit,
    onManualEntry: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            Icons.Default.Warning,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = WarningAmber
        )
        Text(
            message ?: "No pudimos leer el recibo.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center
        )
        Button(onClick = onRetake, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.Refresh, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text("Volver a tomar foto")
        }
        OutlinedButton(onClick = onManualEntry, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.Edit, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text("Introducir manualmente")
        }
    }
}

// --- Helpers ---------------------------------------------------------------

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium)
}

@Composable
private fun FieldWarning(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            Icons.Default.Warning,
            contentDescription = null,
            tint = WarningAmber,
            modifier = Modifier.size(16.dp)
        )
        Spacer(Modifier.size(6.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = WarningAmber)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun amberColorsIf(dubious: Boolean) =
    if (!dubious) OutlinedTextFieldDefaults.colors()
    else OutlinedTextFieldDefaults.colors(
        focusedBorderColor = WarningAmber,
        unfocusedBorderColor = WarningAmber,
        focusedLabelColor = WarningAmber
    )

@Composable
private fun ReceiptThumbnail(uri: Uri?, heightDp: Int) {
    val context = LocalContext.current
    val thumbnail: ImageBitmap? = produceState<ImageBitmap?>(initialValue = null, uri) {
        value = if (uri == null) null else withContext(Dispatchers.IO) {
            ReceiptImageStore.loadBitmap(context, uri, 800)?.asImageBitmap()
        }
    }.value

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(heightDp.dp)
            .background(
                MaterialTheme.colorScheme.surfaceVariant,
                RoundedCornerShape(12.dp)
            ),
        contentAlignment = Alignment.Center
    ) {
        if (thumbnail != null) {
            Image(
                bitmap = thumbnail,
                contentDescription = "Recibo",
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize().padding(4.dp)
            )
        } else {
            Icon(
                Icons.Default.PhotoCamera,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScanDateSelector(date: Long, onDateChange: (Long) -> Unit) {
    var showDialog by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { showDialog = true }, modifier = Modifier.fillMaxWidth()) {
        Text(DateUtils.formatDate(date))
    }
    if (showDialog) {
        val datePickerState = androidx.compose.material3.rememberDatePickerState(
            initialSelectedDateMillis = DateUtils.localMillisToPickerMillis(date)
        )
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = { showDialog = false },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let {
                        onDateChange(DateUtils.pickerMillisToLocalStartOfDay(it))
                    }
                    showDialog = false
                }) { Text("OK") }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { showDialog = false }) {
                    Text("Cancelar")
                }
            }
        ) {
            androidx.compose.material3.DatePicker(state = datePickerState)
        }
    }
}
