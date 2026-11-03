package com.isitworthit.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.isitworthit.app.data.errorMessage
import kotlin.coroutines.cancellation.CancellationException

/** The saved server root, used to build image URLs. */
val LocalServerUrl = compositionLocalOf<String?> { null }

sealed interface Loadable<out T> {
    data object Loading : Loadable<Nothing>
    data class Error(val message: String) : Loadable<Nothing>
    data class Ready<T>(val value: T) : Loadable<T>
}

@Composable
fun <T> LoadableContent(state: Loadable<T>, onRetry: () -> Unit, content: @Composable (T) -> Unit) {
    when (state) {
        Loadable.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        is Loadable.Error -> Column(
            Modifier.fillMaxSize().padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(state.message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
            Button(onClick = onRetry) { Text("Retry") }
        }
        is Loadable.Ready -> content(state.value)
    }
}

@Composable
fun Cover(path: String?, name: String, width: Dp, modifier: Modifier = Modifier) {
    val server = LocalServerUrl.current
    val box = modifier
        .size(width, width * 4 / 3)
        .clip(RoundedCornerShape(6.dp))
        .background(MaterialTheme.colorScheme.surfaceVariant)
    if (path != null && server != null) {
        AsyncImage(
            model = "$server/api/v1/media/$path",
            contentDescription = name,
            contentScale = ContentScale.Crop,
            modifier = box,
        )
    } else {
        Box(box, contentAlignment = Alignment.Center) {
            Text(name.take(1).uppercase(), style = MaterialTheme.typography.titleLarge)
        }
    }
}

data class LoadableHandle<T>(val state: Loadable<T>, val reload: () -> Unit, val refreshing: Boolean)

/**
 * Runs [load] when [keys] change or `reload` is called. While reloading, the previous value stays
 * on screen and `refreshing` is true; a failed reload shows the error.
 */
@Composable
fun <T> rememberLoadable(vararg keys: Any?, load: suspend () -> T): LoadableHandle<T> {
    var state by remember { mutableStateOf<Loadable<T>>(Loadable.Loading) }
    var generation by remember { mutableIntStateOf(0) }
    var refreshing by remember { mutableStateOf(false) }
    LaunchedEffect(*keys, generation) {
        if (state !is Loadable.Ready) state = Loadable.Loading else refreshing = true
        state = try {
            Loadable.Ready(load())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Loadable.Error(errorMessage(e))
        } finally {
            refreshing = false
        }
    }
    return LoadableHandle(state, { generation++ }, refreshing)
}
