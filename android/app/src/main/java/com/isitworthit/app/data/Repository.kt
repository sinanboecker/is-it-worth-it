package com.isitworthit.app.data

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException
import java.io.IOException

data class Dashboard(
    val totals: Totals,
    val years: List<YearStats>,
    val categories: List<CategoryTotals>,
    val nowPlaying: NowPlaying,
    val almostWorthIt: List<ItemSummary>,
    val bestValue: List<ItemSummary>,
    val worstValue: List<ItemSummary>,
    val bestSales: List<ItemSummary>,
    val bundles: BundleTotals,
)

class NoServerException : Exception("No server set. Add its address in Settings.")

class Repository(val preferences: AppPreferences) {
    private var cached: Pair<String, Api>? = null

    private suspend fun api(): Api {
        val url = preferences.serverUrl.first() ?: throw NoServerException()
        cached?.let { (cachedUrl, api) -> if (cachedUrl == url) return api }
        return Api.create(url).also { cached = url to it }
    }

    suspend fun nowPlaying() = api().nowPlaying()
    suspend fun games(q: String?, status: GameStatus?, sort: String) =
        api().items(q = q?.ifBlank { null }, status = status?.key, sort = sort)
    suspend fun item(id: Int) = api().item(id)
    suspend fun setStatus(id: Int, status: GameStatus) = api().updateStatus(id, StatusUpdate(status))
    suspend fun addHours(id: Int, body: HoursAdd) = api().addHours(id, body)
    suspend fun hardware() = api().hardware()
    suspend fun journal() = api().journal()
    suspend fun gameBundles() = api().bundles().filter { it.isGameBundle }
    suspend fun bundle(id: Int) = api().bundle(id)
    suspend fun categories() = api().categories()
    suspend fun stores() = api().stores()
    suspend fun rawgEnabled() = api().metadataStatus().rawg
    suspend fun searchRawg(q: String) = api().searchMetadata(q)

    /**
     * Creates the game, then loads its RAWG info if one was picked. A failed RAWG load doesn't undo the game;
     * the second value is the error message then.
     */
    suspend fun addGame(body: ItemCreate, rawgId: Int?): Pair<Item, String?> {
        val api = api()
        val item = api.createItem(body)
        if (rawgId == null) return item to null
        return try {
            api.applyMetadata(item.id, ApplyMetadata(rawgId)) to null
        } catch (e: Exception) {
            item to "Added, but loading the RAWG info failed: ${errorMessage(e)}"
        }
    }

    /** Everything the dashboard shows, loaded in parallel. */
    suspend fun dashboard(): Dashboard = coroutineScope {
        val api = api()
        val summary = async { api.summary() }
        val yearly = async { api.yearly() }
        val categories = async { api.categoryTotals() }
        val nowPlaying = async { api.nowPlaying() }
        val almost = async { api.top("hours_to_break_even", "asc") }
        val best = async { api.top("cost_per_hour", "asc") }
        val worst = async { api.top("cost_per_hour", "desc") }
        val sales = async { api.top("gain", "desc") }
        val bundles = async { api.bundles().filter { it.isGameBundle } }
        Dashboard(
            summary.await(), yearly.await(), categories.await(), nowPlaying.await(),
            almost.await(), best.await(), worst.await(), sales.await(), BundleTotals.of(bundles.await()),
        )
    }

    /** Checks [url] without saving it; returns null on success or an error message. */
    suspend fun testConnection(url: String): String? = try {
        Api.create(normalizeServerUrl(url)).health()
        null
    } catch (e: Exception) {
        errorMessage(e)
    }
}

/** A short, human-readable message for a failed request, using the server's `detail` when it sent one. */
fun errorMessage(e: Throwable): String = when (e) {
    is HttpException -> serverDetail(e) ?: "Server error ${e.code()}"
    is NoServerException -> e.message!!
    is IllegalArgumentException -> "That doesn't look like a server address."
    is IOException -> "Can't reach the server (${e.message ?: e.javaClass.simpleName})."
    else -> e.message ?: e.javaClass.simpleName
}

private fun serverDetail(e: HttpException): String? = try {
    val body = e.response()?.errorBody()?.string() ?: return null
    when (val detail = Api.json.parseToJsonElement(body).jsonObject["detail"]) {
        is JsonPrimitive -> detail.content
        null -> null
        // FastAPI validation errors: a list of {loc, msg, ...}, where loc ends with the field name
        else -> detail.jsonArray.joinToString("; ") { error ->
            val field = error.jsonObject["loc"]?.jsonArray?.lastOrNull()?.jsonPrimitive?.content
            val message = error.jsonObject["msg"]?.jsonPrimitive?.content ?: ""
            if (field != null) "$field: $message" else message
        }
    }
} catch (_: Exception) {
    null
}
