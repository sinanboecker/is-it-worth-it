package com.isitworthit.app.ui

import android.graphics.Color.TRANSPARENT
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.isitworthit.app.data.ThemeMode

private val Blue = Color(0xFF1C7ED6)

private val LocalDarkTheme = staticCompositionLocalOf { false }

// Signal colors, lighter in dark mode so they stay readable on dark surfaces.
val WorthItGreen: Color
    @Composable @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) Color(0xFF69DB7C) else Color(0xFF2F9E44)

val NotYetOrange: Color
    @Composable @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) Color(0xFFFFA94D) else Color(0xFFE8590C)

@Composable
fun AppTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    val context = LocalContext.current
    val colors = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> darkColorScheme(primary = Color(0xFF74C0FC))
        else -> lightColorScheme(primary = Blue)
    }

    // Status and navigation bar icons follow the app's theme, not only the system's.
    DisposableEffect(dark) {
        val style = SystemBarStyle.auto(TRANSPARENT, TRANSPARENT) { dark }
        (context as? ComponentActivity)?.enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
        onDispose {}
    }

    CompositionLocalProvider(LocalDarkTheme provides dark) {
        MaterialTheme(colorScheme = colors, content = content)
    }
}
