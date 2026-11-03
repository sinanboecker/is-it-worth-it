package com.isitworthit.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.isitworthit.app.data.BundleTotals
import com.isitworthit.app.data.Dashboard
import com.isitworthit.app.data.GameStatus
import com.isitworthit.app.data.ItemSummary
import com.isitworthit.app.data.Repository
import com.isitworthit.app.data.YearStats
import java.text.NumberFormat
import java.util.Locale

/** What the per-year card shows; mirrors the yearly charts on the web dashboard. */
private enum class YearMetric(val label: String, val value: (YearStats) -> Double?, val format: (YearStats) -> String) {
    Spent("Spent", { it.spentCents.toDouble() }, { money(it.spentCents) }),
    Hours("Hours", { it.hours }, { hours(it.hours) }),
    PerHour("€/h", { it.costPerHourCents?.toDouble() }, { perHour(it.costPerHourCents) }),
    Finished("Finished", { it.gamesFinished.toDouble() }, { "${it.gamesFinished}" }),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    repository: Repository,
    padding: PaddingValues,
    openGame: (Int) -> Unit,
    openNowPlaying: () -> Unit,
    openBundles: () -> Unit,
) {
    val (state, reload, refreshing) = rememberLoadable { repository.dashboard() }

    Box(Modifier.padding(padding).fillMaxSize()) {
        LoadableContent(state, onRetry = reload) { data ->
            PullToRefreshBox(isRefreshing = refreshing, onRefresh = reload) {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    item { Text("Dashboard", style = MaterialTheme.typography.headlineSmall) }
                    item { StatTiles(data, openNowPlaying) }
                    if (data.bundles.count > 0) item { BundlesLink(data.bundles, openBundles) }
                    if (data.years.isNotEmpty()) item { YearCard(data.years) }
                    if (data.categories.any { it.totals.totalCostCents > 0 }) item { CategoryCard(data) }
                    item { ItemListCard("Almost worth it", data.almostWorthIt, openGame) { "${hours(it.value?.hoursToBreakEven)} left" } }
                    item { ItemListCard("Best value", data.bestValue, openGame) { perHour(it.value?.costPerHourCents) } }
                    item { ItemListCard("Worst value", data.worstValue, openGame) { perHour(it.value?.costPerHourCents) } }
                    if (data.bestSales.isNotEmpty()) {
                        item { ItemListCard("Best sales", data.bestSales, openGame) { "+${money(-(it.value?.netCostCents ?: 0))}" } }
                    }
                    item { StatusCard(data.totals.statusCounts) }
                }
            }
        }
    }
}

@Composable
private fun StatTiles(data: Dashboard, openNowPlaying: () -> Unit) {
    val t = data.totals
    val percent = NumberFormat.getPercentInstance(Locale.GERMANY)
    val tiles = listOf<@Composable (Modifier) -> Unit>(
        { StatTile("Total spent", money(t.totalCostCents), "incl. ${money(t.hardwareCostCents)} hardware", it) },
        { StatTile("Hours played", hours(t.hours), null, it) },
        { StatTile("All-in €/h", perHour(t.allInCostPerHourCents), "games only ${perHour(t.gamesCostPerHourCents)}", it) },
        { StatTile("Games", "${t.gamesCount}", "worth it: ${t.worthItRate?.let(percent::format) ?: "–"}", it) },
        { StatTile("Backlog", "${t.statusCounts["backlog"] ?: 0}", "${money(t.backlogValueCents)} not played yet", it) },
        {
            StatTile(
                "Now playing", "${data.nowPlaying.playing.size}", "${data.nowPlaying.onHold.size} on hold",
                it.clickable(onClick = openNowPlaying),
            )
        },
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        tiles.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pair.forEach { tile -> tile(Modifier.weight(1f).fillMaxHeight()) }
            }
        }
    }
}

@Composable
private fun StatTile(label: String, value: String, hint: String?, modifier: Modifier) {
    OutlinedCard(modifier) {
        Column(Modifier.padding(12.dp).fillMaxWidth()) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleLarge)
            hint?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun DashboardCard(title: String, content: @Composable () -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}

private const val RECENT_YEARS = 8

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun YearCard(years: List<YearStats>) {
    var metric by rememberSaveable { mutableStateOf(YearMetric.Spent) }
    var showAll by rememberSaveable { mutableStateOf(false) }
    DashboardCard("Per year (by buy year)") {
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            YearMetric.entries.forEachIndexed { index, m ->
                SegmentedButton(
                    selected = metric == m,
                    onClick = { metric = m },
                    shape = SegmentedButtonDefaults.itemShape(index, YearMetric.entries.size),
                    icon = {},
                ) { Text(m.label, maxLines = 1) }
            }
        }
        val max = years.maxOf { metric.value(it) ?: 0.0 }
        val sorted = years.sortedByDescending { it.year }
        sorted.take(if (showAll) sorted.size else RECENT_YEARS).forEach { y ->
            BarRow("${y.year}", metric.value(y) ?: 0.0, max, metric.format(y))
        }
        if (sorted.size > RECENT_YEARS) {
            TextButton(onClick = { showAll = !showAll }) {
                Text(if (showAll) "Show fewer" else "Show all ${sorted.size} years")
            }
        }
    }
}

@Composable
private fun CategoryCard(data: Dashboard) {
    val rows = data.categories.filter { it.totals.totalCostCents > 0 }.sortedByDescending { it.totals.totalCostCents }
    val max = rows.maxOf { it.totals.totalCostCents }.toDouble()
    DashboardCard("Cost per category") {
        rows.forEach { BarRow(it.name, it.totals.totalCostCents.toDouble(), max, money(it.totals.totalCostCents)) }
    }
}

/** A label, a bar for its share of the largest value, and the value. */
@Composable
private fun BarRow(label: String, value: Double, max: Double, text: String, color: Color = MaterialTheme.colorScheme.primary) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, Modifier.width(96.dp), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
        Box(Modifier.weight(1f).height(12.dp).clip(RoundedCornerShape(3.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
            val share = if (max > 0) (value / max).toFloat().coerceIn(0f, 1f) else 0f
            if (share > 0f) Box(Modifier.fillMaxWidth(share).height(12.dp).background(color))
        }
        Text(text, Modifier.width(84.dp), style = MaterialTheme.typography.bodySmall, maxLines = 1)
    }
}

@Composable
private fun ItemListCard(title: String, items: List<ItemSummary>, openGame: (Int) -> Unit, value: (ItemSummary) -> String) {
    DashboardCard(title) {
        if (items.isEmpty()) {
            Text("Nothing here yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items.forEach { item ->
            Row(
                Modifier.fillMaxWidth().clickable { openGame(item.id) }.padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Cover(item.image, item.name, 32.dp)
                Text(item.name, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(value(item), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

/** The way to the bundles page, which has no tab of its own. */
@Composable
private fun BundlesLink(totals: BundleTotals, onClick: () -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Bundles", style = MaterialTheme.typography.titleMedium)
                Text(
                    "${totals.count} game bundles · ${money(totals.costCents)} total cost · ${perHour(totals.costPerHourCents)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StatusCard(counts: Map<String, Int>) {
    DashboardCard("Games by status") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            counts.forEach { (key, count) ->
                val label = GameStatus.entries.find { it.key == key }?.label ?: key
                SuggestionChip(onClick = {}, label = { Text("$label: $count") })
            }
        }
    }
}
