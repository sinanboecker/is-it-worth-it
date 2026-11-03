package com.isitworthit.app.ui

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.isitworthit.app.data.Category
import com.isitworthit.app.data.CopyCreate
import com.isitworthit.app.data.GameStatus
import com.isitworthit.app.data.ItemCreate
import com.isitworthit.app.data.RawgCandidate
import com.isitworthit.app.data.Repository
import com.isitworthit.app.data.errorMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** What the add form needs from the server before it can be shown. */
private class AddGameOptions(val categories: List<Category>, val stores: List<String>, val rawg: Boolean)

/** Statuses for a game that was bought; a game that wasn't bought goes to the wishlist. */
private val boughtStatuses = GameStatus.entries - GameStatus.Wishlist

/** `12,99` or `12.99` → 1299 cents; null for anything that isn't a non-negative amount. */
fun parseCents(input: String): Int? = input.trim().replace(',', '.').toBigDecimalOrNull()
    ?.takeIf { it.signum() >= 0 }
    ?.let { it.multiply(BigDecimal(100)).toInt() }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddGameScreen(repository: Repository, onClose: () -> Unit, onAdded: (Int) -> Unit) {
    val (state, reload) = rememberLoadable {
        AddGameOptions(
            repository.categories().filter { it.type == "platform" },
            repository.stores(),
            runCatching { repository.rawgEnabled() }.getOrDefault(false),
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add game") },
                navigationIcon = { IconButton(onClick = onClose) { Icon(Icons.Default.Close, contentDescription = "Cancel") } },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            LoadableContent(state, onRetry = reload) { options ->
                if (options.categories.isEmpty()) {
                    Text("Add a platform category in the web UI first.", Modifier.padding(16.dp))
                } else {
                    AddGameForm(repository, options, onAdded)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun AddGameForm(repository: Repository, options: AddGameOptions, onAdded: (Int) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var categoryId by rememberSaveable { mutableStateOf(options.categories.first().id) }
    var name by rememberSaveable { mutableStateOf("") }
    var bought by rememberSaveable { mutableStateOf(true) }
    var status by rememberSaveable { mutableStateOf(GameStatus.Backlog) }
    var price by rememberSaveable { mutableStateOf("") }
    var buyDate by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var store by rememberSaveable { mutableStateOf("") }
    var digital by rememberSaveable { mutableStateOf(true) }
    var target by rememberSaveable { mutableStateOf("") }
    var rawgPick by remember { mutableStateOf<RawgCandidate?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val priceCents = parseCents(price)
    val targetCents = parseCents(target)
    val valid = name.isNotBlank() && if (bought) priceCents != null else target.isBlank() || targetCents != null

    fun save() {
        busy = true
        error = null
        val body = ItemCreate(
            categoryId = categoryId,
            name = name.trim(),
            status = if (bought) status else GameStatus.Wishlist,
            targetPriceCents = if (bought) null else targetCents,
            firstCopy = if (!bought) null else CopyCreate(
                buyPriceCents = priceCents!!,
                buyDate = buyDate,
                store = store.trim().ifBlank { null },
                format = if (digital) "digital" else "physical",
            ),
        )
        scope.launch {
            runCatching { repository.addGame(body, rawgPick?.rawgId) }
                .onSuccess { (item, warning) ->
                    Toast.makeText(context, warning ?: "${item.name} added", Toast.LENGTH_LONG).show()
                    onAdded(item.id)
                }
                .onFailure { error = errorMessage(it); busy = false }
        }
    }

    Column(
        Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Dropdown(
            label = "Category",
            value = options.categories.find { it.id == categoryId }?.name ?: "",
            options = options.categories.map { it.name },
            onPick = { categoryId = options.categories[it].id },
        )
        OutlinedTextField(
            value = name,
            onValueChange = { name = it; rawgPick = null },
            label = { Text("Name") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
            modifier = Modifier.fillMaxWidth(),
        )
        if (options.rawg) {
            val pick = rawgPick
            if (pick != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Info and image from RAWG: ${pick.name}", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { rawgPick = null }) { Text("Remove") }
                }
            } else {
                RawgSuggestions(repository, name) { rawgPick = it }
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Bought", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            Switch(checked = bought, onCheckedChange = { bought = it })
        }
        if (bought) {
            Text("Status", style = MaterialTheme.typography.labelLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                boughtStatuses.forEach { s ->
                    FilterChip(selected = status == s, onClick = { status = s }, label = { Text(s.label) })
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MoneyField("Price", price, { price = it }, Modifier.weight(1f))
                DateField("Bought on", buyDate, { buyDate = it }, Modifier.weight(1f))
            }
            StoreField(store, options.stores) { store = it }
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                listOf(true to "Digital", false to "Physical").forEachIndexed { index, (isDigital, label) ->
                    SegmentedButton(
                        selected = digital == isDigital,
                        onClick = { digital = isDigital },
                        shape = SegmentedButtonDefaults.itemShape(index, 2),
                    ) { Text(label) }
                }
            }
        } else {
            Text("Goes to the wishlist.", style = MaterialTheme.typography.bodySmall)
            MoneyField("Target price (optional)", target, { target = it }, Modifier.fillMaxWidth())
        }

        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            onClick = ::save,
            enabled = valid && !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (bought) "Add game" else "Add to wishlist") }
    }
}

/** Up to four RAWG matches for the typed name, searched after a short pause in typing. */
@Composable
private fun RawgSuggestions(repository: Repository, name: String, onPick: (RawgCandidate) -> Unit) {
    var results by remember { mutableStateOf<List<RawgCandidate>>(emptyList()) }
    LaunchedEffect(name) {
        if (name.trim().length < 2) {
            results = emptyList()
            return@LaunchedEffect
        }
        delay(400)
        results = runCatching { repository.searchRawg(name.trim()) }.getOrDefault(emptyList()).take(4)
    }
    if (results.isEmpty()) return
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(8.dp)) {
            Text(
                "Pick the game to load its info and image (optional):",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(4.dp),
            )
            results.forEach { c ->
                Row(
                    Modifier.fillMaxWidth().clickable { onPick(c) }.padding(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AsyncImage(
                        model = c.imageUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(48.dp, 32.dp).clip(RoundedCornerShape(4.dp)),
                    )
                    Column(Modifier.weight(1f)) {
                        Text(c.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            listOfNotNull(c.released?.take(4), c.platforms.take(3).joinToString().ifBlank { null }).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Dropdown(label: String, value: String, options: List<String>, onPick: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEachIndexed { index, option ->
                DropdownMenuItem(text = { Text(option) }, onClick = { onPick(index); open = false })
            }
        }
    }
}

/** A free-text store with the stores already used as suggestions. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StoreField(value: String, stores: List<String>, onChange: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val matches = stores.filter { it.contains(value.trim(), ignoreCase = true) && !it.equals(value.trim(), ignoreCase = true) }
    ExposedDropdownMenuBox(expanded = open && matches.isNotEmpty(), onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = value,
            onValueChange = { onChange(it); open = true },
            label = { Text("Store (optional)") },
            singleLine = true,
            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryEditable).fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = open && matches.isNotEmpty(), onDismissRequest = { open = false }) {
            matches.take(8).forEach { s ->
                DropdownMenuItem(text = { Text(s) }, onClick = { onChange(s); open = false })
            }
        }
    }
}

@Composable
private fun MoneyField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        suffix = { Text("€") },
        singleLine = true,
        isError = value.isNotBlank() && parseCents(value) == null,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateField(label: String, iso: String, onChange: (String) -> Unit, modifier: Modifier) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedTextField(
            value = date(iso),
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { Icon(Icons.Default.CalendarMonth, contentDescription = null) },
            modifier = Modifier.fillMaxWidth(),
        )
        // The read-only field swallows taps; this layer opens the picker instead.
        Box(Modifier.matchParentSize().clickable { open = true })
    }
    if (open) {
        val picker = rememberDatePickerState(
            initialSelectedDateMillis = LocalDate.parse(iso).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    picker.selectedDateMillis?.let { onChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()) }
                    open = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
        ) { DatePicker(picker) }
    }
}
