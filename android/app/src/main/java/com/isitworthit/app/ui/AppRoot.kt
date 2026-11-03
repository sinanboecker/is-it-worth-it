package com.isitworthit.app.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.isitworthit.app.data.Repository
import kotlinx.coroutines.flow.first

private enum class Tab(val route: String, val label: String, val icon: ImageVector) {
    NowPlaying("now", "Now playing", Icons.Default.PlayArrow),
    Library("library", "Library", Icons.AutoMirrored.Filled.List),
    Settings("settings", "Settings", Icons.Default.Settings),
}

@Composable
fun AppRoot(repository: Repository) {
    val serverUrl by repository.settings.serverUrl.collectAsState(initial = null)
    // Open Settings first until a server address has been saved.
    var start by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        start = if (repository.settings.serverUrl.first() == null) Tab.Settings.route else Tab.NowPlaying.route
    }
    val startRoute = start ?: return

    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    CompositionLocalProvider(LocalServerUrl provides serverUrl) {
        Scaffold(
            bottomBar = {
                if (Tab.entries.any { it.route == currentRoute }) {
                    NavigationBar {
                        Tab.entries.forEach { tab ->
                            NavigationBarItem(
                                selected = currentRoute == tab.route,
                                onClick = {
                                    nav.navigate(tab.route) {
                                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = { Icon(tab.icon, contentDescription = null) },
                                label = { Text(tab.label) },
                            )
                        }
                    }
                }
            },
        ) { padding ->
            NavHost(nav, startDestination = startRoute, modifier = Modifier) {
                val openGame = { id: Int -> nav.navigate("game/$id") }
                composable(Tab.NowPlaying.route) { NowPlayingScreen(repository, padding, openGame) }
                composable(Tab.Library.route) { LibraryScreen(repository, padding, openGame) }
                composable(Tab.Settings.route) {
                    SettingsScreen(repository, padding, onSaved = {
                        nav.navigate(Tab.NowPlaying.route) {
                            popUpTo(nav.graph.findStartDestination().id) { inclusive = true }
                        }
                    })
                }
                composable("game/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) {
                    GameScreen(repository, it.arguments!!.getInt("id"), onBack = { nav.popBackStack() })
                }
            }
        }
    }
}
