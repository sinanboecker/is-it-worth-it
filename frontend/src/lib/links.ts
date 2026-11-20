/** Links to a game in stores and price sites. */

export const steamUrl = (steamAppId: number | null | undefined): string | null =>
  steamAppId ? `https://store.steampowered.com/app/${steamAppId}/` : null;

/** The game on gg.deals (prices incl. keyshops): its page when the gg.deals slug is known, else gg.deals' link by
 * Steam app ID, else a search for the name. */
export function ggDealsUrl(game: { name: string; ggdeals_slug?: string | null; steam_app_id?: number | null }): string {
  if (game.ggdeals_slug) return `https://gg.deals/game/${encodeURIComponent(game.ggdeals_slug)}/`;
  if (game.steam_app_id) return `https://gg.deals/steam/app/${game.steam_app_id}/`;
  return `https://gg.deals/games/?title=${encodeURIComponent(game.name)}`;
}
