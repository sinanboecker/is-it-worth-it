package com.isitworthit.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreTime
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.isitworthit.app.data.ItemSummary
import com.isitworthit.app.data.NowPlayingCard
import com.isitworthit.app.data.Repository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowPlayingScreen(repository: Repository, padding: PaddingValues, openGame: (Int) -> Unit) {
    val (state, reload, refreshing) = rememberLoadable { repository.nowPlaying() }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var logging by remember { mutableStateOf<ItemSummary?>(null) }

    Box(Modifier.padding(padding).fillMaxSize()) {
        LoadableContent(state, onRetry = reload) { now ->
            PullToRefreshBox(isRefreshing = refreshing, onRefresh = reload) {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    item { Text("Now playing", style = MaterialTheme.typography.headlineSmall) }
                    if (now.playing.isEmpty() && now.onHold.isEmpty() && now.upNext.isEmpty()) {
                        item { Text("Nothing in progress. Set a game to Playing in the library.") }
                    }
                    cards("Playing", now.playing, openGame) { logging = it }
                    cards("On hold", now.onHold, openGame) { logging = it }
                    if (now.upNext.isNotEmpty()) {
                        item { SectionTitle("Up next") }
                        items(now.upNext, key = { "next-${it.id}" }) { game -> GameRow(game, onClick = { openGame(game.id) }) }
                    }
                }
            }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
    }

    logging?.let { game ->
        LogHoursDialog(
            repository, game.id, game.name, game.devices,
            onDismiss = { logging = null },
            onLogged = { result ->
                logging = null
                reload()
                scope.launch { snackbar.reportLogged(repository, result) { reload() } }
            },
        )
    }
}

private fun LazyListScope.cards(
    title: String,
    cards: List<NowPlayingCard>,
    openGame: (Int) -> Unit,
    logHours: (ItemSummary) -> Unit,
) {
    if (cards.isEmpty()) return
    item { SectionTitle(title) }
    items(cards, key = { "$title-${it.item.id}" }) { card ->
        NowPlayingRow(card, onClick = { openGame(card.item.id) }, onLog = { logHours(card.item) })
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
}

@Composable
private fun NowPlayingRow(card: NowPlayingCard, onClick: () -> Unit, onLog: () -> Unit) {
    val game = card.item
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(game.image, game.name, 56.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(game.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(valueLine(game), style = MaterialTheme.typography.bodySmall)
            card.breakEven?.let { be ->
                LinearProgressIndicator(
                    progress = { be.progress.toFloat().coerceIn(0f, 1f) },
                    color = if (be.hoursLeft <= 0) WorthItGreen else MaterialTheme.colorScheme.primary,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    if (be.hoursLeft <= 0) "Worth it" else "${hours(be.hoursLeft)} to break even",
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
        FilledTonalIconButton(onClick = onLog) { Icon(Icons.Default.MoreTime, contentDescription = "Log hours") }
    }
}

fun valueLine(game: ItemSummary): String {
    val v = game.value ?: return game.status?.label ?: ""
    return "${hours(v.hours)} · ${perHour(v.costPerHourCents)}"
}
