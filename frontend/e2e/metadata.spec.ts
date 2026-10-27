import { expect, test } from "@playwright/test";

async function category(request: import("@playwright/test").APIRequestContext, name: string) {
  return (await request.post("/api/v1/categories", { data: { name: `${name} ${Date.now()}` } })).json();
}

test("add a game with info and image from RAWG", async ({ page, request }) => {
  const pc = await category(request, "PC");
  await page.goto(`/categories/${pc.id}`);
  await page.getByRole("button", { name: "Game", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("hades");
  // RAWG suggestions appear while typing
  await dialog.getByRole("button", { name: /^Hades\b.*2020/ }).click();
  await expect(dialog.getByText("Info and image from RAWG: Hades")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Buy price", exact: true }).fill("24,99");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Hades added")).toBeVisible();

  await page.getByRole("row", { name: /Hades/ }).click();
  await expect(page.getByRole("heading", { name: "Hades" })).toBeVisible();
  await expect(page.getByText("Defy the god of the dead.")).toBeVisible();
  await expect(page.getByText(/Released 17\.09\.2020 · Roguelike · Supergiant Games/)).toBeVisible();
  const image = page.locator('img[alt="Hades"]').first();
  await expect(image).toHaveAttribute("src", /\/api\/v1\/media\/covers\/.+\.jpg/);
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: "RAWG" }).first()).toHaveAttribute("href", "https://rawg.io");
});

test("pick a DLC from the Steam list", async ({ page, request }) => {
  const pc = await category(request, "PC");
  const game = await (
    await request.post("/api/v1/items", {
      data: { category_id: pc.id, kind: "game", name: "Witcher 3", first_copy: { buy_date: "2024-01-01", buy_price_cents: 2999 } },
    })
  ).json();
  await request.post(`/api/v1/items/${game.id}/metadata`, { data: { rawg_id: 3, rename: false } });

  await page.goto(`/items/${game.id}`);
  await page.getByRole("button", { name: "Add DLC" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("3 DLC found on Steam (with current price)")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Name" }).click();
  await page.getByRole("option", { name: /Blood and Wine/ }).click();
  await expect(dialog.getByRole("textbox", { name: "Price", exact: true })).toHaveValue("19,99 €");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("DLC · 19,99 €")).toBeVisible();
});

test("fetch missing info for a category, with review and a search by hand", async ({ page, request }) => {
  const nintendo = await category(request, "Nintendo");
  for (const name of ["The Legend of Zelda – Tears of the Kingdom", "Tetris", "Hadez"]) {
    await request.post("/api/v1/items", {
      data: { category_id: nintendo.id, kind: "game", name, first_copy: { buy_date: "2024-01-01", buy_price_cents: 1000 } },
    });
  }
  await page.goto(`/categories/${nintendo.id}`);
  await page.getByRole("button", { name: "Fetch info" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Start" }).click();
  await expect(dialog.getByText(/1 matched automatically/)).toBeVisible();
  await expect(dialog.getByText("Which game is “Tetris”?")).toBeVisible();
  await dialog.getByRole("button", { name: /^Tetris.*1989/ }).click();

  // misspelled: nothing found until the name is corrected
  await expect(dialog.getByText("Which game is “Hadez”?")).toBeVisible();
  await expect(dialog.getByText("Nothing found on RAWG.")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Search RAWG" }).fill("Hades");
  await dialog.getByLabel("Also use RAWG's name for this game").check();
  await dialog.getByRole("button", { name: /^Hades.*2020/ }).click();
  await expect(dialog.getByText("Done. 1 games matched automatically.")).toBeVisible();
  await page.keyboard.press("Escape");

  const tetris = (await (await request.get(`/api/v1/items?category=${nintendo.id}&q=Tetris`)).json())[0];
  expect(tetris.cover_path).toMatch(/^covers\//);
  const hades = (await (await request.get(`/api/v1/items?category=${nintendo.id}&q=Hades`)).json())[0];
  expect(hades.name).toBe("Hades");
});

test("add a game bundle (Humble style): equal split, RAWG info and status for the first game", async ({ page, request }) => {
  const pc = await category(request, "PC");
  const suffix = pc.id;
  await page.goto(`/categories/${pc.id}`);
  await page.getByRole("button", { name: "Game", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("hades");
  await dialog.getByRole("button", { name: /^Hades\b.*2020/ }).click();
  await dialog.getByRole("textbox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Currently playing" }).click();
  await dialog.getByLabel(/Bought as a bundle \(e\.g\. a Steam bundle/).check();
  await dialog.getByRole("textbox", { name: "Bundle name" }).fill(`Humble Indie Bundle ${suffix}`);
  await dialog.getByRole("textbox", { name: "Total price of the bundle", exact: true }).fill("12");
  await dialog.getByRole("textbox", { name: "Split the price" }).click();
  await page.getByRole("option", { name: "Equal shares" }).click();
  await dialog.getByLabel("New: name").fill(`Celeste ${suffix}`);
  await dialog.getByRole("button", { name: "Add another game" }).click();
  await dialog.getByLabel("New: name").nth(1).fill(`Hollow Knight ${suffix}`);
  await expect(dialog.getByText("4,00 €")).toHaveCount(3);
  await dialog.getByRole("button", { name: "Add bundle" }).click();
  await expect(page.getByText("Hades added with 2 more item(s)")).toBeVisible();

  const games = await (await request.get(`/api/v1/items?category=${pc.id}`)).json();
  const byName = Object.fromEntries(games.map((g: { name: string }) => [g.name, g]));
  expect(byName["Hades"].status).toBe("playing");
  expect(byName["Hades"].cover_path).toMatch(/^covers\//);
  expect(byName["Hades"].copies_summary.formats).toEqual(["digital"]);
  expect(byName[`Celeste ${suffix}`].status).toBe("backlog");
  expect(byName[`Celeste ${suffix}`].copies_summary.formats).toEqual(["digital"]);
  for (const g of games) expect(g.value.net_cost_cents).toBe(400);
});

test("fetch missing info goes on when RAWG's best match is gone", async ({ page, request }) => {
  const pc = await category(request, "PC");
  for (const name of ["Ghost Recon Phantoms", "Hades"]) {
    await request.post("/api/v1/items", {
      data: { category_id: pc.id, kind: "game", name, first_copy: { buy_date: "2024-01-01", buy_price_cents: 1000 } },
    });
  }
  await page.goto(`/categories/${pc.id}`);
  await page.getByRole("button", { name: "Fetch info" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Start" }).click();
  await expect(dialog.getByText(/1 matched automatically/)).toBeVisible(); // Hades
  await expect(dialog.getByText("Which game is “Ghost Recon Phantoms”?")).toBeVisible();
  await expect(dialog.getByText(/isn't on RAWG any more/)).toBeVisible();
  await dialog.getByRole("button", { name: "Skip" }).click();
  await expect(dialog.getByText("Done. 1 games matched automatically.")).toBeVisible();
});
