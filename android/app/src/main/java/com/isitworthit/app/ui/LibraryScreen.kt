package com.isitworthit.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.isitworthit.app.data.GameStatus
import com.isitworthit.app.data.ItemSummary
import com.isitworthit.app.data.Repository
import kotlinx.coroutines.delay

// The sort keys the server accepts (GET /items?sort=); "-" means descending.
private val sorts = listOf(
    "name" to "Name",
    "-last_played" to "Last played",
    "-hours" to "Most hours",
    "cost_per_hour" to "Cost per hour",
    "-rating" to "Rating",
    "-first_bought" to "Recently bought",
)

@Composable
fun LibraryScreen(repository: Repository, padding: PaddingValues, openGame: (Int) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var status by rememberSaveable { mutableStateOf<GameStatus?>(null) }
    var sort by rememberSaveable { mutableStateOf("name") }
    var sortMenu by rememberSaveable { mutableStateOf(false) }

    val (state, reload) = rememberLoadable(query, status, sort) {
        delay(300) // debounce typing
        repository.games(query, status, sort)
    }

    Column(Modifier.padding(padding).fillMaxSize()) {
        Row(
            Modifier.padding(start = 16.dp, end = 8.dp, top = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Search games") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(onClick = { query = "" }) { Icon(Icons.Default.Clear, contentDescription = "Clear") }
                    }
                },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            Box {
                IconButton(onClick = { sortMenu = true }) {
                    Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = "Sort")
                }
                DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                    sorts.forEach { (key, label) ->
                        DropdownMenuItem(
                            text = { Text(if (key == sort) "✓ $label" else label) },
                            onClick = { sort = key; sortMenu = false },
                        )
                    }
                }
            }
        }
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            GameStatus.entries.forEach { s ->
                FilterChip(
                    selected = status == s,
                    onClick = { status = if (status == s) null else s },
                    label = { Text(s.label) },
                )
            }
        }
        LoadableContent(state, onRetry = reload) { games ->
            if (games.isEmpty()) {
                Text("No games found.", modifier = Modifier.padding(16.dp))
            }
            LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
                items(games, key = { it.id }) { game ->
                    GameRow(game, onClick = { openGame(game.id) }, Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
fun GameRow(game: ItemSummary, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).then(modifier),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(game.image, game.name, 44.dp)
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    game.name,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (game.favorite) {
                    Icon(
                        Icons.Default.Favorite, contentDescription = "Favorite",
                        tint = MaterialTheme.colorScheme.error, modifier = Modifier.padding(start = 2.dp),
                    )
                }
            }
            Text(
                listOfNotNull(game.status?.label, game.devices.firstOrNull()?.hardwareName).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        game.value?.let { v ->
            Column(horizontalAlignment = Alignment.End) {
                Text(hours(v.hours), style = MaterialTheme.typography.bodyMedium)
                Text(
                    perHour(v.costPerHourCents),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (v.worthIt) WorthItGreen else NotYetOrange,
                )
            }
        }
    }
}
