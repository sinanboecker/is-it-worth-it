import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { CategoryPage } from "./pages/CategoryPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ItemPage } from "./pages/ItemPage";
import { JournalPage } from "./pages/JournalPage";
import { BacklogPage, FavoritesPage, WishlistPage } from "./pages/ListPages";
import { NotFoundPage } from "./pages/NotFoundPage";
import { NowPlayingPage } from "./pages/NowPlayingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Navigate to="/dashboard" replace /> },
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/now-playing", element: <NowPlayingPage /> },
      { path: "/journal", element: <JournalPage /> },
      { path: "/favorites", element: <FavoritesPage /> },
      { path: "/wishlist", element: <WishlistPage /> },
      { path: "/backlog", element: <BacklogPage /> },
      { path: "/categories/:id", element: <CategoryPage /> },
      { path: "/items/:id", element: <ItemPage /> },
      { path: "/stats", element: <StatsPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
