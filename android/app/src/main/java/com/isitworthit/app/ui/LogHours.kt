package com.isitworthit.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.isitworthit.app.data.HoursAdd
import com.isitworthit.app.data.HoursResult
import com.isitworthit.app.data.Item
import com.isitworthit.app.data.PlayLink
import com.isitworthit.app.data.Repository
import com.isitworthit.app.data.errorMessage
import kotlinx.coroutines.launch
import java.time.LocalDate

private data class Device(val id: Int, val name: String)

/** Adds play time to a game: hours, the device it was played on, and the day. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LogHoursDialog(
    repository: Repository,
    itemId: Int,
    name: String,
    linked: List<PlayLink>,
    onDismiss: () -> Unit,
    onLogged: (HoursResult) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val linkedDevices = linked.sortedByDescending { it.lastPlayedAt ?: "" }.map { Device(it.hardwareId, it.hardwareName) }
    var devices by remember { mutableStateOf(linkedDevices) }
    var device by remember { mutableStateOf(linkedDevices.firstOrNull()) }
    var input by remember { mutableStateOf("") }
    var yesterday by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }

    // Linked devices first, then every other device, for a game played somewhere new.
    LaunchedEffect(Unit) {
        runCatching { repository.hardware() }.onSuccess { all ->
            val known = linkedDevices.map { it.id }.toSet()
            devices = linkedDevices + all.filter { it.id !in known }.map { Device(it.id, it.name) }
        }
    }

    val hours = input.replace(',', '.').toDoubleOrNull()?.takeIf { it > 0 }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Log hours") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(name, style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it; error = null },
                    label = { Text("Hours") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("0.5", "1", "2", "3").forEach { preset ->
                        FilterChip(
                            selected = input == preset,
                            onClick = { input = preset },
                            label = { Text(preset.replace('.', ',')) },
                        )
                    }
                }
                ExposedDropdownMenuBox(expanded = menuOpen, onExpandedChange = { menuOpen = it }) {
                    OutlinedTextField(
                        value = device?.name ?: "Choose a device",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Device") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = menuOpen) },
                        modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                    )
                    ExposedDropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        devices.forEach { d ->
                            DropdownMenuItem(text = { Text(d.name) }, onClick = { device = d; menuOpen = false })
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = !yesterday, onClick = { yesterday = false }, label = { Text("Today") })
                    FilterChip(selected = yesterday, onClick = { yesterday = true }, label = { Text("Yesterday") })
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = hours != null && device != null && !busy,
                onClick = {
                    busy = true
                    scope.launch {
                        val playedOn = LocalDate.now().minusDays(if (yesterday) 1 else 0).toString()
                        runCatching { repository.addHours(itemId, HoursAdd(hours!!, device!!.id, playedOn)) }
                            .onSuccess(onLogged)
                            .onFailure { error = errorMessage(it); busy = false }
                    }
                },
            ) { Text("Log") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Confirms logged hours and, when the server suggests a new status (e.g. backlog → playing), offers to apply it. */
suspend fun SnackbarHostState.reportLogged(
    repository: Repository,
    result: HoursResult,
    onItem: (Item) -> Unit,
) {
    val logged = "Logged. ${hours(result.item.value?.hours)} total, ${perHour(result.item.value?.costPerHourCents)}"
    val suggestion = result.suggestedStatus
    if (suggestion == null || suggestion == result.item.status) {
        showSnackbar(logged)
        return
    }
    val answer = showSnackbar(logged, actionLabel = "Mark ${suggestion.label.lowercase()}", duration = SnackbarDuration.Long)
    if (answer == SnackbarResult.ActionPerformed) {
        runCatching { repository.setStatus(result.item.id, suggestion) }
            .onSuccess(onItem)
            .onFailure { showSnackbar(errorMessage(it)) }
    }
}
