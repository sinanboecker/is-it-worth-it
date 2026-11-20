import { ggDealsUrl, steamUrl } from "./links";

test("Steam link only with a Steam app ID", () => {
  expect(steamUrl(1145360)).toBe("https://store.steampowered.com/app/1145360/");
  expect(steamUrl(null)).toBeNull();
});

test("gg.deals link: by slug, else by Steam app ID, else a search", () => {
  expect(ggDealsUrl({ name: "Hades", ggdeals_slug: "hades", steam_app_id: 1145360 })).toBe("https://gg.deals/game/hades/");
  expect(ggDealsUrl({ name: "Hades", steam_app_id: 1145360 })).toBe("https://gg.deals/steam/app/1145360/");
  expect(ggDealsUrl({ name: "Mafia: The Old Country" })).toBe("https://gg.deals/games/?title=Mafia%3A%20The%20Old%20Country");
});
