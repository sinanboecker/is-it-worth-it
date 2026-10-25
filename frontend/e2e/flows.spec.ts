import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import pkg from "../package.json" with { type: "json" };

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

/** Mantine's SegmentedControl moves its radio inputs off-screen; click the visible label instead. */
async function pickSegment(scope: Locator, name: string) {
  const id = await scope.getByRole("radio", { name }).getAttribute("id");
  await scope.locator(`label[for="${id}"]`).click();
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
  await dialog.locator('input[type="file"]').setInputFiles(path.join(import.meta.dirname, "../../backend/tests/fixtures/test_pc.csv"));
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
  for (const url of ["/", "/dashboard", "/now-playing", "/journal", "/favorites", "/wishlist", "/backlog", "/stats", "/settings"]) {
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

test("add a category from the sidebar", async ({ page }) => {
  const name = `PlayStation ${Date.now()}`;
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "New category" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Category saved")).toBeVisible();

  // opens the new category and lists it in the sidebar
  await expect(page).toHaveURL(/\/categories\/\d+$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name })).toBeVisible();
});

test("search from the header and open the result", async ({ page, request }) => {
  const { category } = await setup(request);
  const name = `Metroid Dread ${category.id}`;
  await request.post("/api/v1/items", {
    data: { category_id: category.id, kind: "game", name, first_copy: { buy_date: "2024-01-01", buy_price_cents: 3999 } },
  });

  await page.goto("/");
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.getByRole("banner").getByRole("textbox", { name: "Search" });
  await expect(search).toBeFocused();
  await search.fill(`dread ${category.id}`);
  const option = page.getByRole("option", { name: new RegExp(name) });
  await expect(option).toContainText(category.name);
  await option.click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(search).toHaveValue("");

  await search.fill("no such game xyz");
  await expect(page.getByText("Nothing found")).toBeVisible();
});

test("quick-add a game from the header", async ({ page, request }) => {
  const { category } = await setup(request);
  const header = page.getByRole("banner");

  // from the dashboard: pick the category in the dialog
  await page.goto("/");
  await header.getByRole("button", { name: "Add game" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Category" }).click();
  await page.getByRole("option", { name: category.name, exact: true }).click();
  await dialog.getByLabel("Name").fill(`Kirby ${category.id}`);
  await fillMoney(page, "Buy price", "49,99");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("heading", { name: `Kirby ${category.id}` })).toBeVisible();

  // from a category page: that category is preselected
  await page.goto(`/categories/${category.id}`);
  await header.getByRole("button", { name: "Add game" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "Category" })).toHaveValue(category.name);
});

test("the start page is the dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("settings show the version and the repository link", async ({ page }) => {
  const { version } = pkg;
  await page.goto("/settings");
  const about = page.getByRole("heading", { name: "About" }).locator("..");
  await expect(about.getByRole("link", { name: version, exact: true })).toHaveAttribute(
    "href",
    `https://github.com/sinanboecker/is-it-worth-it/tree/v${version}`,
  );
  await expect(about.getByRole("link", { name: /github\.com\/sinanboecker\/is-it-worth-it/ })).toHaveAttribute(
    "href",
    "https://github.com/sinanboecker/is-it-worth-it",
  );
});

test("typed dates are read as day.month.year", async ({ page, request }) => {
  const { category } = await setup(request);
  await page.goto(`/categories/${category.id}`);
  await page.getByRole("button", { name: "Game", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(`Date ${category.id}`);
  const date = dialog.getByRole("textbox", { name: "Bought on" });
  await date.fill("05.03.2024");
  await date.press("Tab");
  await expect(date).toHaveValue("05.03.2024");
  await fillMoney(page, "Buy price", "10");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(`Date ${category.id} added`)).toBeVisible();

  const [game] = await (await request.get(`/api/v1/items?q=Date ${category.id}`)).json();
  const detail = await (await request.get(`/api/v1/items/${game.id}`)).json();
  expect(detail.copies[0].buy_date).toBe("2024-03-05");
});

test("pick a category icon in the category dialog", async ({ page, request }) => {
  const name = `Konsole ${Date.now()}`;
  await page.goto("/dashboard");
  await page.getByRole("navigation").getByRole("button", { name: "New category" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await expect(dialog.getByRole("radio", { name: "Folder" })).toBeChecked();
  await dialog.getByRole("radio", { name: "PlayStation", exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "PlayStation", exact: true })).toBeChecked();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Category saved")).toBeVisible();

  const categories = await (await request.get("/api/v1/categories")).json();
  expect(categories.find((c: { name: string }) => c.name === name).icon).toBe("playstation");
});
