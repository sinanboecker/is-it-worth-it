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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.isitworthit.app.data.JournalEntry
import com.isitworthit.app.data.JournalYear
import com.isitworthit.app.data.Repository
import java.time.Month
import java.time.format.TextStyle
import java.util.Locale

/** Finished games by year and month, like the web journal. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JournalScreen(repository: Repository, padding: PaddingValues, openGame: (Int) -> Unit) {
    val (state, reload, refreshing) = rememberLoadable { repository.journal() }

    Box(Modifier.padding(padding).fillMaxSize()) {
        LoadableContent(state, onRetry = reload) { journal ->
            PullToRefreshBox(isRefreshing = refreshing, onRefresh = reload) {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    item { Text("Journal", style = MaterialTheme.typography.headlineSmall) }
                    if (journal.years.isEmpty() && journal.unknownDate.isEmpty()) {
                        item { Text("No finished games yet. Mark a game as finished and it shows up here.") }
                    }
                    journal.years.forEach { year -> year(year, openGame) }
                    if (journal.unknownDate.isNotEmpty()) {
                        item { Text("Date unknown", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 16.dp)) }
                        entries(journal.unknownDate, "unknown", openGame)
                    }
                }
            }
        }
    }
}

private fun LazyListScope.year(year: JournalYear, openGame: (Int) -> Unit) {
    item(key = "year-${year.year}") {
        Column(Modifier.padding(top = 16.dp)) {
            Text("${year.year}", style = MaterialTheme.typography.headlineMedium)
            Text(
                listOfNotNull(
                    "${year.finishedCount} finished",
                    hours(year.totalHours),
                    year.averageRating?.let { "Ø ${"%.1f".format(Locale.GERMANY, it)} ★" },
                    year.mostUsedDevice?.let { "mostly on $it" },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    year.months.forEach { month ->
        item(key = "month-${year.year}-${month.month}") {
            Text(
                Month.of(month.month).getDisplayName(TextStyle.FULL, Locale.ENGLISH),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        entries(month.entries, "${year.year}-${month.month}", openGame)
    }
}

private fun LazyListScope.entries(entries: List<JournalEntry>, keyPrefix: String, openGame: (Int) -> Unit) {
    items(entries, key = { "$keyPrefix-${it.completionId}" }) { entry -> EntryRow(entry, onClick = { openGame(entry.itemId) }) }
}

@Composable
private fun EntryRow(entry: JournalEntry, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(entry.coverPath, entry.name, 44.dp)
        Column(Modifier.weight(1f)) {
            Text(
                entry.name + if (entry.replay) " (replay)" else "",
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                listOfNotNull(
                    entry.finishedOn?.let(::date),
                    entry.hardwareName?.let { it + if (entry.emulated) " (emulated)" else "" },
                    hours(entry.hours),
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            entry.rating?.let { Text("★ ${"%.1f".format(Locale.GERMANY, it)}", style = MaterialTheme.typography.bodyMedium) }
            entry.costPerHourCents?.let {
                Text(
                    perHour(it),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (entry.worthIt == true) WorthItGreen else NotYetOrange,
                )
            }
        }
    }
}
