package com.isitworthit.app.data

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNamingStrategy
import kotlinx.serialization.json.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

interface Api {
    @GET("health")
    suspend fun health(): JsonObject

    @GET("now-playing")
    suspend fun nowPlaying(): NowPlaying

    @GET("categories")
    suspend fun categories(): List<Category>

    @GET("items")
    suspend fun items(
        @Query("kind") kind: String = "game",
        @Query("q") q: String? = null,
        @Query("status") status: String? = null,
        @Query("sort") sort: String = "name",
    ): List<ItemSummary>

    @GET("items/{id}")
    suspend fun item(@Path("id") id: Int): Item

    @PATCH("items/{id}")
    suspend fun updateStatus(@Path("id") id: Int, @Body body: StatusUpdate): Item

    @POST("items/{id}/hours")
    suspend fun addHours(@Path("id") id: Int, @Body body: HoursAdd): HoursResult

    @GET("hardware")
    suspend fun hardware(): List<ItemSummary>

    companion object {
        @OptIn(ExperimentalSerializationApi::class)
        val json = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
            coerceInputValues = true
            namingStrategy = JsonNamingStrategy.SnakeCase
        }

        private val client = OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

        /** [serverUrl] is the normalized server root, e.g. `http://192.168.1.10:8820`. */
        fun create(serverUrl: String): Api = Retrofit.Builder()
            .baseUrl("$serverUrl/api/v1/")
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(Api::class.java)
    }
}
