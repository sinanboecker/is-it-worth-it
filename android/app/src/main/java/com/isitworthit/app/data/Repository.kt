package com.isitworthit.app.data

import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException
import java.io.IOException

class NoServerException : Exception("No server set. Add its address in Settings.")

class Repository(val settings: ServerSettings) {
    private var cached: Pair<String, Api>? = null

    private suspend fun api(): Api {
        val url = settings.serverUrl.first() ?: throw NoServerException()
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
        // FastAPI validation errors: a list of {loc, msg, ...}
        else -> detail.jsonArray.joinToString("; ") { it.jsonObject["msg"]?.jsonPrimitive?.content ?: "" }
    }
} catch (_: Exception) {
    null
}
