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
) {
    val image get() = imagePath ?: coverPath
}

@Serializable
data class Category(val id: Int, val name: String, val defaultDeviceId: Int? = null)

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
