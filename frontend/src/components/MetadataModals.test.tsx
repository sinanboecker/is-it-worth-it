import { rawgThumb } from "./MetadataModals";

test("RAWG thumbnails use a size RAWG serves (resize to a fixed width)", () => {
  expect(rawgThumb("https://media.rawg.io/media/games/618/618c.jpg")).toBe("https://media.rawg.io/media/resize/420/-/games/618/618c.jpg");
  expect(rawgThumb("https://media.rawg.io/media/screenshots/a7c/a7c4.jpg", 640)).toBe(
    "https://media.rawg.io/media/resize/640/-/screenshots/a7c/a7c4.jpg",
  );
  expect(rawgThumb("http://localhost:8811/images/cover.png")).toBe("http://localhost:8811/images/cover.png");
  expect(rawgThumb(null)).toBeNull();
});
