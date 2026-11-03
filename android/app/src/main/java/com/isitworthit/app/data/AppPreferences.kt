package com.isitworthit.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "settings")
private val SERVER_URL = stringPreferencesKey("server_url")
private val THEME = stringPreferencesKey("theme")

enum class ThemeMode(val label: String) { System("System"), Light("Light"), Dark("Dark") }

class AppPreferences(private val context: Context) {
    val serverUrl: Flow<String?> = context.dataStore.data.map { it[SERVER_URL] }
    val theme: Flow<ThemeMode> = context.dataStore.data.map { prefs ->
        ThemeMode.entries.find { it.name == prefs[THEME] } ?: ThemeMode.System
    }

    suspend fun setServerUrl(url: String) {
        context.dataStore.edit { it[SERVER_URL] = normalizeServerUrl(url) }
    }

    suspend fun setTheme(mode: ThemeMode) {
        context.dataStore.edit { it[THEME] = mode.name }
    }
}

/** `192.168.1.10:8820/` → `http://192.168.1.10:8820`: plain HTTP unless a scheme is given, no trailing slash. */
fun normalizeServerUrl(input: String): String {
    val trimmed = input.trim().trimEnd('/')
    return if ("://" in trimmed) trimmed else "http://$trimmed"
}
