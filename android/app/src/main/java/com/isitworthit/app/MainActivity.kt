package com.isitworthit.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.isitworthit.app.ui.AppRoot
import com.isitworthit.app.ui.AppTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val repository = (application as App).repository
        setContent {
            AppTheme {
                AppRoot(repository)
            }
        }
    }
}
