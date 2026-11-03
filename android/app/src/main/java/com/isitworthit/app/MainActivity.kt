package com.isitworthit.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.isitworthit.app.data.ThemeMode
import com.isitworthit.app.ui.AppRoot
import com.isitworthit.app.ui.AppTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val repository = (application as App).repository
        setContent {
            val theme by repository.preferences.theme.collectAsState(initial = ThemeMode.System)
            AppTheme(theme) {
                AppRoot(repository)
            }
        }
    }
}
