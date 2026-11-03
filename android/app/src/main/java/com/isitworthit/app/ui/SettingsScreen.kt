package com.isitworthit.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.isitworthit.app.BuildConfig
import com.isitworthit.app.data.Repository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(repository: Repository, padding: PaddingValues, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    var url by rememberSaveable { mutableStateOf("") }
    var result by rememberSaveable { mutableStateOf<String?>(null) }
    var ok by rememberSaveable { mutableStateOf(false) }
    var busy by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        if (url.isEmpty()) url = repository.settings.serverUrl.first() ?: ""
    }

    fun check(then: () -> Unit = {}) {
        busy = true
        scope.launch {
            val error = repository.testConnection(url)
            ok = error == null
            result = error ?: "Connected."
            busy = false
            if (ok) then()
        }
    }

    Column(
        Modifier.padding(padding).padding(16.dp).fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Server", style = MaterialTheme.typography.headlineSmall)
        Text(
            "The address of your Is It Worth It? server on the home network, " +
                "for example http://192.168.1.10:8820.",
            style = MaterialTheme.typography.bodyMedium,
        )
        OutlinedTextField(
            value = url,
            onValueChange = { url = it; result = null },
            label = { Text("Server URL") },
            placeholder = { Text("http://192.168.1.10:8820") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = { check() }, enabled = url.isNotBlank() && !busy) { Text("Test") }
            Button(
                onClick = {
                    // Saved even when unreachable, so the address can be set up away from home.
                    scope.launch { repository.settings.setServerUrl(url) }
                    check(then = onSaved)
                },
                enabled = url.isNotBlank() && !busy,
            ) { Text("Save") }
        }
        result?.let {
            Text(it, color = if (ok) WorthItGreen else MaterialTheme.colorScheme.error)
        }
        Text(
            "App version ${BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 24.dp),
        )
    }
}
