package com.walletapp.data.preferences

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.walletapp.ui.theme.ThemeMode
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "wallet_settings")

@Singleton
class SettingsDataStore @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val currencyKey = stringPreferencesKey("currency")
    private val themeKey = stringPreferencesKey("theme_mode")
    private val scanAccountKey = longPreferencesKey("default_scan_account")

    val currency: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[currencyKey] ?: "USD"
    }

    /**
     * Cuenta por defecto para las transacciones creadas al escanear recibos.
     * null = automático (última cuenta usada en un gasto, o la primera).
     */
    val defaultScanAccountId: Flow<Long?> = context.dataStore.data.map { prefs ->
        prefs[scanAccountKey]
    }

    val themeMode: Flow<ThemeMode> = context.dataStore.data.map { prefs ->
        when (prefs[themeKey]) {
            "LIGHT" -> ThemeMode.LIGHT
            "DARK" -> ThemeMode.DARK
            else -> ThemeMode.SYSTEM
        }
    }

    suspend fun setCurrency(currency: String) {
        context.dataStore.edit { it[currencyKey] = currency }
    }

    suspend fun setThemeMode(mode: ThemeMode) {
        context.dataStore.edit { it[themeKey] = mode.name }
    }

    /** Define (o limpia con null) la cuenta por defecto para escaneos. */
    suspend fun setDefaultScanAccountId(id: Long?) {
        context.dataStore.edit { prefs ->
            if (id == null) prefs.remove(scanAccountKey) else prefs[scanAccountKey] = id
        }
    }
}
