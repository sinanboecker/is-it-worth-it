package com.isitworthit.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Subsets of the server's OpenAPI schemas (frontend/openapi.json). Field names are mapped from
// snake_case by the Json naming strategy in Api.kt; unknown fields are ignored.

@Serializable
enum class GameStatus(val label: String, val key: String) {
    @SerialName("wishlist") Wishlist("Wishlist", "wishlist"),
    @SerialName("backlog") Backlog("Backlog", "backlog"),
    @SerialName("playing") Playing("Playing", "playing"),
    @SerialName("on_hold") OnHold("On hold", "on_hold"),
    @SerialName("played") Played("Played", "played"),
    @SerialName("finished") Finished("Finished", "finished"),
    @SerialName("abandoned") Abandoned("Abandoned", "abandoned"),
    @SerialName("endless") Endless("Endless", "endless"),
    @SerialName("not_redeemed") NotRedeemed("Not redeemed", "not_redeemed"),
}

@Serializable
data class ValueRead(
    val hours: Double = 0.0,
    val netCostCents: Int = 0,
    val costPerHourCents: Int? = null,
    val worthIt: Boolean = false,
    val hoursToBreakEven: Double = 0.0,
    val thresholdCph: Int = 0,
    val totalPaidCents: Int = 0,
    val timesFinished: Int = 0,
    val lastFinishedOn: String? = null,
)

@Serializable
data class CopiesSummary(
    val copiesCount: Int = 0,
    val owned: Boolean = false,
    val sold: Boolean = false,
    val firstBoughtOn: String? = null,
    val stores: List<String> = emptyList(),
    val formats: List<String> = emptyList(),
)

@Serializable
data class PlayLink(
    val hardwareId: Int,
    val hardwareName: String,
    val emulated: Boolean = false,
    val hours: Double = 0.0,
    val lastPlayedAt: String? = null,
)

@Serializable
data class ItemSummary(
    val id: Int,
    val categoryId: Int,
    val kind: String,
    val name: String,
    val status: GameStatus? = null,
    val rating: Double? = null,
    val favorite: Boolean = false,
    val startedOn: String? = null,
    val lastPlayedOn: String? = null,
    val coverPath: String? = null,
    val imagePath: String? = null,
    val copiesSummary: CopiesSummary = CopiesSummary(),
    val devices: List<PlayLink> = emptyList(),
    val value: ValueRead? = null,
) {
    val image get() = imagePath ?: coverPath
}

@Serializable
data class Item(
    val id: Int,
    val categoryId: Int,
    val kind: String,
    val name: String,
    val status: GameStatus? = null,
    val rating: Double? = null,
    val favorite: Boolean = false,
    val startedOn: String? = null,
    val lastPlayedOn: String? = null,
    val coverPath: String? = null,
    val imagePath: String? = null,
    val releaseDate: String? = null,
    val copiesSummary: CopiesSummary = CopiesSummary(),
    val devices: List<PlayLink> = emptyList(),
    val value: ValueRead? = null,
    val notes: String? = null,
    val summary: String? = null,
    val genres: String? = null,
    val developer: String? = null,
    val copies: List<Copy> = emptyList(),
) {
    val image get() = imagePath ?: coverPath
}

@Serializable
data class Category(val id: Int, val name: String, val type: String = "platform", val defaultDeviceId: Int? = null)

@Serializable
data class BreakEven(val hours: Double, val targetHours: Double, val hoursLeft: Double, val progress: Double)

@Serializable
data class NowPlayingCard(val item: ItemSummary, val daysSinceStart: Int? = null, val breakEven: BreakEven? = null)

@Serializable
data class NowPlaying(
    val playing: List<NowPlayingCard> = emptyList(),
    val onHold: List<NowPlayingCard> = emptyList(),
    val upNext: List<ItemSummary> = emptyList(),
)

@Serializable
data class HoursAdd(val hours: Double, val hardwareId: Int? = null, val playedOn: String? = null)

@Serializable
data class HoursResult(val item: Item, val suggestedStatus: GameStatus? = null)

@Serializable
data class StatusUpdate(val status: GameStatus)

@Serializable
data class Totals(
    val totalCostCents: Int = 0,
    val gamesCostCents: Int = 0,
    val dlcCostCents: Int = 0,
    val hardwareCostCents: Int = 0,
    val hours: Double = 0.0,
    val allInCostPerHourCents: Int? = null,
    val gamesCostPerHourCents: Int? = null,
    val statusCounts: Map<String, Int> = emptyMap(),
    val gamesCount: Int = 0,
    val hardwareCount: Int = 0,
    val worthItRate: Double? = null,
    val backlogValueCents: Int = 0,
)

@Serializable
data class YearStats(
    val year: Int,
    val spentCents: Int = 0,
    val gamesBought: Int = 0,
    val hours: Double = 0.0,
    val costPerHourCents: Int? = null,
    val gamesFinished: Int = 0,
)

@Serializable
data class CategoryTotals(val categoryId: Int, val name: String, val totals: Totals)

@Serializable
data class JournalEntry(
    val completionId: Int,
    val itemId: Int,
    val name: String,
    val coverPath: String? = null,
    val finishedOn: String? = null,
    val hardwareName: String? = null,
    val emulated: Boolean = false,
    val hours: Double = 0.0,
    val rating: Double? = null,
    val replay: Boolean = false,
    val costPerHourCents: Int? = null,
    val worthIt: Boolean? = null,
)

@Serializable
data class JournalMonth(val month: Int, val entries: List<JournalEntry> = emptyList())

@Serializable
data class JournalYear(
    val year: Int,
    val finishedCount: Int = 0,
    val totalHours: Double = 0.0,
    val averageRating: Double? = null,
    val mostUsedDevice: String? = null,
    val months: List<JournalMonth> = emptyList(),
)

@Serializable
data class Journal(val years: List<JournalYear> = emptyList(), val unknownDate: List<JournalEntry> = emptyList())

@Serializable
data class CopyCreate(
    val buyPriceCents: Int,
    val buyDate: String? = null,
    val store: String? = null,
    val format: String = "digital",
)

@Serializable
data class ItemCreate(
    val categoryId: Int,
    val name: String,
    val kind: String = "game",
    val status: GameStatus? = null,
    val targetPriceCents: Int? = null,
    val firstCopy: CopyCreate? = null,
)

/** A RAWG search result: picking one loads the game's info and cover. */
@Serializable
data class RawgCandidate(
    val rawgId: Int,
    val name: String,
    val released: String? = null,
    val platforms: List<String> = emptyList(),
    val imageUrl: String? = null,
)

@Serializable
data class MetadataStatus(val rawg: Boolean = false)

@Serializable
data class ApplyMetadata(val rawgId: Int, val rename: Boolean = false)

@Serializable
data class BundleCopy(
    val copyId: Int,
    val itemId: Int,
    val itemName: String,
    val kind: String,
    val buyPriceCents: Int = 0,
    val sellPriceCents: Int? = null,
    val sellDate: String? = null,
    val status: GameStatus? = null,
    val coverPath: String? = null,
    val imagePath: String? = null,
    /** The whole game or device, not only this copy. */
    val value: ValueRead? = null,
) {
    val image get() = imagePath ?: coverPath
}

@Serializable
data class Bundle(
    val id: Int,
    val name: String,
    val buyDate: String,
    val totalPriceCents: Int = 0,
    val url: String? = null,
    val otherSalesCents: Int = 0,
    val store: String? = null,
    val notes: String? = null,
    val copies: List<BundleCopy> = emptyList(),
    /** What the bundle's copies and untracked parts were sold for so far. */
    val soldCents: Int = 0,
    /** The bundle as one purchase; hours are those of its games. */
    val value: ValueRead = ValueRead(),
) {
    /** Only games, no hardware (a console bundle is not one); the bundles page lists only these, like the web UI. */
    val isGameBundle get() = copies.all { it.kind == "game" }
}

/** Totals over several bundles, as on the web bundles page (frontend/src/lib/bundles.ts). */
data class BundleTotals(val count: Int, val spentCents: Int, val earnedCents: Int, val hours: Double) {
    val costCents get() = spentCents - earnedCents
    val costPerHourCents get() = if (hours > 0) Math.round(costCents / hours).toInt() else null

    companion object {
        fun of(bundles: List<Bundle>): BundleTotals {
            // a game in two bundles counts its hours once
            val gameHours = bundles.flatMap { it.copies }.filter { it.kind == "game" }
                .associate { it.itemId to (it.value?.hours ?: 0.0) }
            return BundleTotals(
                count = bundles.size,
                spentCents = bundles.sumOf { it.totalPriceCents },
                earnedCents = bundles.sumOf { it.soldCents },
                hours = Math.round(gameHours.values.sum() * 100) / 100.0,
            )
        }
    }
}

@Serializable
data class Copy(val id: Int, val bundleId: Int? = null)
