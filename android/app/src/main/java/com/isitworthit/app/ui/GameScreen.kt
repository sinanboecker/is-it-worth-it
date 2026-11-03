package com.isitworthit.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.MoreTime
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.isitworthit.app.data.GameStatus
import com.isitworthit.app.data.Item
import com.isitworthit.app.data.Repository
import com.isitworthit.app.data.errorMessage
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GameScreen(repository: Repository, id: Int, onBack: () -> Unit, openBundle: (Int) -> Unit) {
    val (state, reload) = rememberLoadable(id) { repository.item(id) }
    // Responses from edits replace the loaded item until the next reload.
    var edited by remember { mutableStateOf<Item?>(null) }
    val item = edited ?: (state as? Loadable.Ready)?.value
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var logging by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(item?.name ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
        floatingActionButton = {
            if (item != null && item.kind == "game" && item.status != GameStatus.Wishlist) {
                ExtendedFloatingActionButton(
                    onClick = { logging = true },
                    icon = { Icon(Icons.Default.MoreTime, contentDescription = null) },
                    text = { Text("Log hours") },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            LoadableContent(state, onRetry = reload) {
                GameDetails(item!!, openBundle, onStatus = { status ->
                    scope.launch {
                        runCatching { repository.setStatus(id, status) }
                            .onSuccess { edited = it }
                            .onFailure { snackbar.showSnackbar(errorMessage(it)) }
                    }
                })
            }
        }
    }

    if (logging && item != null) {
        LogHoursDialog(
            repository, item.id, item.name, item.devices,
            onDismiss = { logging = false },
            onLogged = { result ->
                logging = false
                edited = result.item
                scope.launch { snackbar.reportLogged(repository, result) { edited = it } }
            },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GameDetails(item: Item, openBundle: (Int) -> Unit, onStatus: (GameStatus) -> Unit) {
    var statusMenu by remember { mutableStateOf(false) }
    val value = item.value

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Cover(item.image, item.name, 120.dp)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(item.name, style = MaterialTheme.typography.titleLarge)
                if (item.kind == "game") {
                    Box {
                        AssistChip(
                            onClick = { statusMenu = true },
                            label = { Text(item.status?.label ?: "No status") },
                            trailingIcon = { Icon(Icons.Default.ArrowDropDown, contentDescription = null) },
                        )
                        DropdownMenu(expanded = statusMenu, onDismissRequest = { statusMenu = false }) {
                            GameStatus.entries.forEach { s ->
                                DropdownMenuItem(text = { Text(s.label) }, onClick = { statusMenu = false; onStatus(s) })
                            }
                        }
                    }
                }
                item.rating?.let { Text("★ ${"%.1f".format(it)} / 5", style = MaterialTheme.typography.bodyMedium) }
                listOfNotNull(item.developer, item.releaseDate?.take(4)).takeIf { it.isNotEmpty() }?.let {
                    Text(it.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        if (value != null) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Stat("Hours", hours(value.hours))
                Stat("Net cost", money(value.netCostCents))
                Stat("Per hour", perHour(value.costPerHourCents), if (value.worthIt) WorthItGreen else NotYetOrange)
                Stat(
                    "Break even",
                    if (value.worthIt) "Worth it" else "${hours(value.hoursToBreakEven)} to go",
                    if (value.worthIt) WorthItGreen else null,
                )
                if (value.timesFinished > 0) Stat("Finished", "${value.timesFinished}×")
            }
        }

        if (item.devices.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionTitle("Devices")
                item.devices.forEach { d ->
                    Row(Modifier.fillMaxWidth()) {
                        Text(d.hardwareName + if (d.emulated) " (emulated)" else "", Modifier.weight(1f))
                        Text(hours(d.hours))
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SectionTitle("Dates")
            DateRow("First bought", item.copiesSummary.firstBoughtOn)
            DateRow("Started", item.startedOn)
            DateRow("Last played", item.lastPlayedOn)
            value?.lastFinishedOn?.let { DateRow("Last finished", it) }
        }

        item.copies.mapNotNull { it.bundleId }.distinct().forEach { bundleId ->
            OutlinedCard(Modifier.fillMaxWidth().clickable { openBundle(bundleId) }) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Bought in a bundle", Modifier.weight(1f))
                    Text("Open bundle", color = MaterialTheme.colorScheme.primary)
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                }
            }
        }

        item.summary?.takeIf { it.isNotBlank() }?.let {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionTitle("About")
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
        }
        item.notes?.takeIf { it.isNotBlank() }?.let {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionTitle("Notes")
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
        }
        // Room for the floating button.
        Box(Modifier.padding(bottom = 64.dp))
    }
}

@Composable
private fun Stat(label: String, value: String, color: Color? = null) {
    OutlinedCard {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp).width(96.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleMedium, color = color ?: Color.Unspecified)
        }
    }
}

@Composable
private fun DateRow(label: String, iso: String?) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(date(iso))
    }
}
