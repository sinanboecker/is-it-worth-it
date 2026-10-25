import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";

/** Test data through the API; the flows under test go through the UI. */
async function setup(request: APIRequestContext) {
  const post = async (url: string, data: object) => (await request.post(`/api/v1${url}`, { data })).json();
  const category = await post("/categories", { name: `Nintendo ${Date.now()}` });
  const device = await post("/items", {
    category_id: category.id,
    kind: "hardware",
    name: `Switch ${category.id}`,
    first_copy: { buy_date: "2022-01-10", buy_price_cents: 30000 },
  });
  await request.patch(`/api/v1/categories/${category.id}`, { data: { default_device_id: device.id } });
  return { category, device };
}

async function fillMoney(page: Page, label: string, value: string) {
  const input = page.getByRole("dialog").getByRole("textbox", { name: label, exact: true });
  await input.fill(value);
}

test("add a game, log hours, finish it, see it in the journal", async ({ page, request }) => {
  const { category } = await setup(request);
  const name = `Zelda ${category.id}`;

  await page.goto(`/categories/${category.id}`);
  await page.getByRole("button", { name: "Game", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await fillMoney(page, "Buy price", "59,99");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(`${name} added`)).toBeVisible();

  // the new game is in the table with its cost
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("59,99 €");
  await row.click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // + hours (device pre-selected: the category's default device)
  await page.getByRole("button", { name: "Hours", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Hours played").fill("20");
  await page.getByRole("dialog").getByRole("button", { name: "Add" }).click();
  // backlog game with hours → offer to switch to "Currently playing"
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByText("20 h", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Currently playing").first()).toBeVisible();

  // cost per hour: 59,99 € / 20 h
  await expect(page.getByText("3,00 €/h").first()).toBeVisible();

  // finished, with a review and a rating for the game
  await page.getByRole("button", { name: "Finished", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Review").fill("Great game");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${name} finished 🎉`)).toBeVisible();
  await expect(page.getByText("Great game")).toBeVisible();

  await page.getByRole("link", { name: "Journal" }).click();
  await expect(page.getByText(name).first()).toBeVisible();
});

test("add a second copy and sell the first one", async ({ page, request }) => {
  const { category } = await setup(request);
  const game = await (
    await request.post("/api/v1/items", {
      data: {
        category_id: category.id,
        kind: "game",
        name: `Mario ${category.id}`,
        first_copy: { buy_date: "2020-01-01", buy_price_cents: 6000, format: "physical" },
      },
    })
  ).json();

  await page.goto(`/items/${game.id}`);
  await page.getByRole("button", { name: "Add copy" }).click();
  await fillMoney(page, "Buy price", "20");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Copies (2 owned)")).toBeVisible();

  await page.getByRole("button", { name: "Edit copy" }).first().click();
  await fillMoney(page, "Sold for", "30");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Copies (1 owned, 1 sold)")).toBeVisible();
  // net cost: 60 + 20 − 30
  await expect(page.getByText("50,00 €").first()).toBeVisible();
});

test("import games from a CSV file", async ({ page, request }) => {
  const { category } = await setup(request);
  await page.goto(`/categories/${category.id}`);
  await page.getByRole("button", { name: "Import CSV" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles(path.join(import.meta.dirname, "../../test_pc.csv"));
  await dialog.getByRole("button", { name: "Preview" }).click();
  await expect(dialog.getByText("24 new")).toBeVisible();
  await expect(dialog.getByText("Ignored columns: Stundenpreis")).toBeVisible();
  await dialog.getByRole("button", { name: "Import 24 rows" }).click();
  await expect(page.getByText("Imported 24 games")).toBeVisible();
  await expect(page.getByRole("row", { name: /Frontline Echo/ })).toContainText("0,33 €/h");
});

test("all pages load without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const url of ["/", "/dashboard", "/journal", "/favorites", "/wishlist", "/backlog", "/stats", "/settings"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("mark a game as favorite and find it on the favorites page", async ({ page, request }) => {
  const { category } = await setup(request);
  const name = `Favorite ${category.id}`;
  const game = await (
    await request.post("/api/v1/items", {
      data: { category_id: category.id, kind: "game", name, first_copy: { buy_date: "2024-01-01", buy_price_cents: 1000 } },
    })
  ).json();

  await page.goto(`/items/${game.id}`);
  await page.getByRole("button", { name: "Add to favorites" }).click();
  await expect(page.getByText(`${name} is a favorite ❤`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove from favorites" })).toBeVisible();

  await page.getByRole("link", { name: "Favorites" }).click();
  await expect(page.getByRole("heading", { name: "Favorites" })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();

  await page.getByText(name, { exact: true }).click();
  await page.getByRole("button", { name: "Remove from favorites" }).click();
  await page.getByRole("link", { name: "Favorites" }).click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
});

test("add a console as a bundle with a game, then edit the bundle", async ({ page, request }) => {
  const { category } = await setup(request);
  const consoleName = `PS5 Slim ${category.id}`;
  const gameName = `Astro Bot ${category.id}`;

  await page.goto(`/categories/${category.id}`);
  await page.getByRole("button", { name: "Hardware", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(consoleName);
  await dialog.getByLabel(/Bought as a bundle/).check();
  await dialog.getByRole("textbox", { name: "Total price of the bundle", exact: true }).fill("449");
  await dialog.getByRole("textbox", { name: "Standalone price" }).first().fill("499");
  await dialog.getByLabel("New: name").fill(gameName);
  await dialog.getByRole("textbox", { name: "Standalone price" }).nth(1).fill("59");
  // live split preview: 449 € × 499/558 and 449 € × 59/558
  await expect(dialog.getByText("401,53 €")).toBeVisible();
  await expect(dialog.getByText("47,47 €")).toBeVisible();
  await dialog.getByRole("button", { name: "Add bundle" }).click();
  await expect(page.getByText(`${consoleName} added with 1 more item(s)`)).toBeVisible();

  // the game got its share as its own copy
  await page.getByRole("tab", { name: "Games" }).click();
  await page.getByRole("row", { name: new RegExp(gameName) }).click();
  await expect(page.getByRole("cell", { name: "47,47 €" })).toBeVisible();

  // edit the bundle from the copy: switch to equal shares
  await page.getByRole("button", { name: "Bundle", exact: true }).click();
  const edit = page.getByRole("dialog");
  await edit.getByRole("textbox", { name: "Split" }).click();
  await page.getByRole("option", { name: "Equal shares" }).click();
  await expect(edit.getByText("224,50 €").first()).toBeVisible();
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Bundle saved")).toBeVisible();
  await expect(page.getByRole("cell", { name: "224,50 €" })).toBeVisible();
});
