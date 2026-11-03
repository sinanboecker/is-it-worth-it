package com.isitworthit.app.ui

import android.content.Intent
import android.net.Uri
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.isitworthit.app.data.Bundle
import com.isitworthit.app.data.BundleCopy
import com.isitworthit.app.data.BundleTotals
import com.isitworthit.app.data.Repository
import com.isitworthit.app.data.ValueRead

/** All game bundles with their totals, per year or overall; a bundle opens its games. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BundlesScreen(repository: Repository, onBack: () -> Unit, openBundle: (Int) -> Unit) {
    val (state, reload, refreshing) = rememberLoadable { repository.gameBundles() }
    var year by rememberSaveable { mutableStateOf<Int?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Bundles") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            LoadableContent(state, onRetry = reload) { all ->
                val years = all.map { it.buyDate.take(4).toInt() }.distinct().sortedDescending()
                val bundles = all.filter { year == null || it.buyDate.startsWith("$year") }.sortedByDescending { it.buyDate }
                PullToRefreshBox(isRefreshing = refreshing, onRefresh = reload) {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        if (all.isEmpty()) {
                            item { Text("No game bundles yet. Add them in the web UI.") }
                        } else {
                            item {
                                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    FilterChip(selected = year == null, onClick = { year = null }, label = { Text("All years") })
                                    years.forEach { y ->
                                        FilterChip(selected = year == y, onClick = { year = y }, label = { Text("$y") })
                                    }
                                }
                            }
                            item { TotalsCard(year, BundleTotals.of(bundles)) }
                            items(bundles, key = { it.id }) { bundle -> BundleCard(bundle, onClick = { openBundle(bundle.id) }) }
                        }
                    }
                }
            }
        }
    }
}

/** Money spent and earned, cost, hours and cost per hour of the bundles shown. Tinted, so it doesn't read as one more bundle. */
@Composable
private fun TotalsCard(year: Int?, t: BundleTotals) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (year == null) "All game bundles" else "Game bundles bought in $year", style = MaterialTheme.typography.titleMedium)
            Text("${t.count} bundle${if (t.count == 1) "" else "s"}", style = MaterialTheme.typography.bodySmall)
            Figures(
                "Money spent" to money(t.spentCents),
                "Money earned" to (if (t.earnedCents > 0) money(t.earnedCents) else "–"),
                "Total cost" to money(t.costCents),
                "Hours" to hours(t.hours),
                "Cost per hour" to perHour(t.costPerHourCents),
                perRow = 3,
            )
        }
    }
}

@Composable
private fun BundleCard(bundle: Bundle, onClick: () -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(bundle.name, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                WorthIt(bundle.value)
            }
            Text(boughtLine(bundle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Figures(
                "Bought for" to money(bundle.totalPriceCents),
                "Net cost" to money(bundle.value.netCostCents),
                "Hours" to hours(bundle.value.hours),
                "Per hour" to perHour(bundle.value.costPerHourCents),
            )
        }
    }
}

/** One bundle: its figures and the games and devices in it, each opening its own page. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BundleScreen(repository: Repository, id: Int, onBack: () -> Unit, openGame: (Int) -> Unit) {
    val (state, reload) = rememberLoadable(id) { repository.bundle(id) }
    val bundle = (state as? Loadable.Ready)?.value
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(bundle?.name ?: "Bundle", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
                actions = {
                    bundle?.url?.let { url ->
                        IconButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }) {
                            Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "Open the bundle's link")
                        }
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            LoadableContent(state, onRetry = reload) { b ->
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(boughtLine(b), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                                WorthIt(b.value)
                            }
                            Figures(
                                "Bought for" to money(b.totalPriceCents),
                                "Sold for" to (if (b.soldCents > 0) money(b.soldCents) else "–"),
                                "Net cost" to money(b.value.netCostCents),
                                "Hours" to hours(b.value.hours),
                                "Per hour" to perHour(b.value.costPerHourCents),
                                perRow = 3,
                            )
                            if (b.otherSalesCents > 0) {
                                Text(
                                    "Sold for includes ${money(b.otherSalesCents)} not listed below.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            b.notes?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                            SectionTitle(if (b.copies.isEmpty()) "No games listed" else "Games")
                        }
                    }
                    items(b.copies.sortedBy { it.itemName.lowercase() }, key = { it.copyId }) { copy ->
                        BundleCopyRow(copy, onClick = { openGame(copy.itemId) })
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun BundleCopyRow(copy: BundleCopy, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(copy.image, copy.itemName, 44.dp)
        Column(Modifier.weight(1f)) {
            Text(copy.itemName, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(
                    copy.status?.label ?: if (copy.kind == "hardware") "Hardware" else null,
                    "share ${money(copy.buyPriceCents)}",
                    copy.sellPriceCents?.let { "sold for ${money(it)}" },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        copy.value?.let { v ->
            Column(horizontalAlignment = Alignment.End) {
                Text(hours(v.hours), style = MaterialTheme.typography.bodyMedium)
                WorthIt(v)
            }
        }
    }
}

private fun boughtLine(bundle: Bundle): String {
    val games = bundle.copies.size
    return "Bought ${date(bundle.buyDate)}${bundle.store?.let { " at $it" } ?: ""} · $games game${if (games == 1) "" else "s"}"
}

/** "Worth it" in green, or the hours still needed in orange. */
@Composable
private fun WorthIt(value: ValueRead) {
    Text(
        if (value.worthIt) "Worth it" else "${hours(value.hoursToBreakEven)} to go",
        style = MaterialTheme.typography.labelMedium,
        color = if (value.worthIt) WorthItGreen else NotYetOrange,
    )
}

/** Label/value pairs in a grid of [perRow] equal columns. */
@Composable
private fun Figures(vararg figures: Pair<String, String>, perRow: Int = figures.size) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        figures.toList().chunked(perRow).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (label, value) ->
                    Column(Modifier.weight(1f)) {
                        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        Text(value, style = MaterialTheme.typography.titleSmall, maxLines = 1)
                    }
                }
                // keep the columns of a short last row aligned with the rows above
                repeat(perRow - row.size) { Box(Modifier.weight(1f)) }
            }
        }
    }
}
