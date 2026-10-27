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
  for (const url of ["/", "/dashboard", "/now-playing", "/journal", "/favorites", "/wishlist", "/backlog", "/bundles", "/pc", "/stats", "/settings"]) {
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

test("the bundles page shows each bundle with its games, sales, hours and worth it", async ({ page, request }) => {
  const { category, device } = await setup(request);
  const name = `Humble Bundle ${category.id}`;
  const bundle = await (
    await request.post("/api/v1/bundles", {
      data: {
        name,
        buy_date: "2025-03-01",
        total_price_cents: 2000,
        split_mode: "equal",
        entries: ["Played", "Resold"].map((game) => ({
          new_item: { category_id: category.id, kind: "game", name: `${game} ${category.id}` },
          format: "digital",
        })),
      },
    })
  ).json();
  const [played, resold] = bundle.copies;
  const consoleBundle = `Console bundle ${category.id}`;
  await request.post("/api/v1/bundles", {
    data: {
      name: consoleBundle,
      buy_date: "2025-03-01",
      total_price_cents: 40000,
      split_mode: "equal",
      entries: [
        { new_item: { category_id: category.id, kind: "hardware", name: `Console ${category.id}` } },
        { new_item: { category_id: category.id, kind: "game", name: `Pack-in ${category.id}` }, format: "physical" },
      ],
    },
  });
  await request.post(`/api/v1/items/${played.item_id}/hours`, { data: { hours: 4, hardware_id: device.id } });
  await request.patch(`/api/v1/items/${resold.item_id}/copies/${resold.copy_id}`, {
    data: { sell_price_cents: 800, sell_date: "2025-04-01" },
  });

  await page.goto("/dashboard");
  await page.getByRole("navigation").getByRole("link", { name: "Bundles" }).click();
  const card = page.locator(".mantine-Card-root", { hasText: name });
  await expect(card.getByText("Bought 01.03.2025")).toBeVisible();
  await expect(card.getByText("✔ worth it").first()).toBeVisible(); // 20 € − 8 € sold = 12 € for 4 h: 3 €/h
  await expect(card.getByText("3,00 €/h")).toBeVisible();
  await expect(card.getByRole("row", { name: new RegExp(`Resold ${category.id}`) })).toContainText("8,00 € · 01.04.2025");
  await expect(page.getByText(consoleBundle)).toHaveCount(0); // bundles with hardware are left out
  await card.getByRole("link", { name: `Played ${category.id}` }).click();
  await expect(page.getByRole("heading", { name: `Played ${category.id}` })).toBeVisible();
});

test("add a game bundle with a link and money from selling keys", async ({ page, request }) => {
  const { category } = await setup(request);
  const name = `Humble Choice ${category.id}`;

  await page.goto("/bundles");
  await page.getByRole("button", { name: "Add bundle" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await dialog.getByRole("textbox", { name: "Link" }).fill("https://www.humblebundle.com/membership");
  await fillMoney(page, "Price", "12");
  await fillMoney(page, "Earned from other sales", "4");
  await expect(dialog.getByRole("textbox", { name: "Split the price" })).toHaveValue("Equal shares"); // default here

  await dialog.getByLabel("New: name").fill(`Key A ${category.id}`);
  await dialog.getByRole("textbox", { name: "Category" }).click();
  await page.getByRole("option", { name: category.name }).click();
  await dialog.getByRole("button", { name: "Add game" }).click();
  await dialog.getByLabel("New: name").nth(1).fill(`Key B ${category.id}`); // same category as the game before
  await expect(dialog.getByText("8,00 € shared by 2 games")).toBeVisible();
  await expect(dialog.getByText("4,00 €", { exact: true })).toHaveCount(2);
  await dialog.getByRole("button", { name: "Add bundle" }).click();
  await expect(page.getByText(`Bundle “${name}” added with 2 game(s)`)).toBeVisible();

  const card = page.locator(".mantine-Card-root", { hasText: name });
  await expect(card.getByText("incl. 4,00 € not listed below")).toBeVisible();
  await expect(card.getByRole("link", { name: `Open the link of ${name}` })).toHaveAttribute(
    "href",
    "https://www.humblebundle.com/membership",
  );
  await expect(card.getByRole("row", { name: new RegExp(`Key B ${category.id}`) })).toContainText("4,00 €");
});

test("add a bundle without games when all of them were sold", async ({ page }) => {
  const name = `All sold ${Date.now()}`;
  await page.goto("/bundles");
  await page.getByRole("button", { name: "Add bundle" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await fillMoney(page, "Price", "8");
  await fillMoney(page, "Earned from other sales", "10");
  await dialog.getByRole("button", { name: "Remove from bundle" }).click();
  await expect(dialog.getByText("No games: the bundle only keeps its price")).toBeVisible();
  await dialog.getByRole("button", { name: "Add bundle" }).click();
  await expect(page.getByText(`Bundle “${name}” added with 0 game(s)`)).toBeVisible();

  const card = page.locator(".mantine-Card-root", { hasText: name });
  await expect(card.getByText("No games listed.")).toBeVisible();
  await expect(card.getByText("-2,00 €")).toBeVisible(); // net cost: 8 € − 10 €
});

test("import bundles from a CSV sheet", async ({ page, request }) => {
  const { category } = await setup(request);
  const id = category.id;
  const sheet = [
    `Choice ${id};;8,00;5,00;;;`,
    `Kept ${id};03.01.2023;;;2;✓;`,
    `Sold ${id};03.01.2023;;3,00;;;Verkauft`,
    "",
    `All sold ${id};01.02.2023;8,00;10,00;;;`,
  ].join("\n");

  await page.goto("/bundles");
  await page.getByRole("button", { name: "Import" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "bundles.csv", mimeType: "text/csv", buffer: Buffer.from(sheet) });
  await dialog.getByRole("textbox", { name: "Category of the games" }).click();
  await page.getByRole("option", { name: category.name }).click();
  await dialog.getByRole("button", { name: "Preview" }).click();
  await expect(dialog.getByText("2,00 € other sales")).toBeVisible();
  await expect(dialog.getByText("no games listed: only the price and the sales are imported")).toBeVisible();
  await dialog.getByRole("button", { name: "Import 2 bundles" }).click();
  await expect(page.getByText("Imported 2 bundles: 2 new games")).toBeVisible();

  const card = page.locator(".mantine-Card-root", { hasText: `Choice ${id}` });
  await expect(card.getByText("Bought 03.01.2023 at Humble Bundle")).toBeVisible();
  await expect(card.getByRole("row", { name: new RegExp(`Kept ${id}`) })).toContainText("2 h");
  await expect(page.locator(".mantine-Card-root", { hasText: `All sold ${id}` }).getByText("No games listed.")).toBeVisible();
});

test("the last sort is remembered and used by all lists", async ({ page, request }) => {
  const { category } = await setup(request);
  for (const [name, price] of [["Cheap", 500], ["Pricey", 6000]] as const) {
    await request.post("/api/v1/items", {
      data: { category_id: category.id, kind: "game", name: `${name} ${category.id}`, first_copy: { buy_date: "2024-01-01", buy_price_cents: price } },
    });
  }
  await request.post("/api/v1/items", { data: { category_id: category.id, kind: "game", name: `Wish ${category.id}` } });
  const firstGame = () => page.getByRole("row").nth(1);

  await page.goto(`/categories/${category.id}`);
  await expect(page.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
  await page.getByRole("button", { name: "Cost", exact: true }).click();
  await page.getByRole("button", { name: "Cost", exact: true }).click();
  const cost = page.getByRole("columnheader", { name: "Cost" });
  await expect(cost).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByRole("columnheader", { name: "Name" })).not.toHaveAttribute("aria-sort");
  await expect(firstGame()).toContainText(`Pricey ${category.id}`);

  await page.reload();
  await expect(cost).toHaveAttribute("aria-sort", "descending");
  await expect(firstGame()).toContainText(`Pricey ${category.id}`);

  await page.goto("/backlog"); // another list with a cost column sorts the same way
  await expect(page.getByRole("columnheader", { name: "Cost" })).toHaveAttribute("aria-sort", "descending");
  await page.goto("/wishlist"); // no cost column: the wishlist's own default
  await expect(page.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
});

test("create a PC build, add parts to it, sell one and see what they cost per day", async ({ page, request }) => {
  const { device } = await setup(request);
  const name = `Gaming PC ${device.id}`;
  const gpuName = `GPU ${device.id}`;
  const row = (scope: Page | Locator, part: string) => scope.getByRole("row", { name: new RegExp(part) });

  await page.goto("/dashboard");
  await page.getByRole("navigation").getByRole("link", { name: "PC builds" }).click();
  await page.getByRole("button", { name: "New build" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("textbox", { name: "Device in the app" }).click();
  await page.getByRole("option", { name: device.name }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`Build “${name}” saved`)).toBeVisible();

  const card = page.locator(".mantine-Card-root", { hasText: name });
  await card.getByRole("button", { name: "Part" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name" }).fill(gpuName);
  await dialog.getByRole("textbox", { name: "Category" }).click();
  await page.getByRole("option", { name: "GPU" }).click();
  await dialog.getByRole("textbox", { name: "Bought on" }).fill("01.01.2021");
  await dialog.getByRole("textbox", { name: "Used until" }).fill("01.01.2023");
  await fillMoney(page, "Buy price", "800");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${gpuName} saved`)).toBeVisible();

  await expect(row(card, gpuName)).toContainText("GPU"); // category
  await expect(row(card, gpuName)).toContainText("730"); // days
  await expect(row(card, gpuName)).toContainText("2 years");
  await expect(row(card, gpuName)).toContainText("1,10 €/day"); // 800 € / 730 days
  await expect(card.getByText("Bought for")).toBeVisible();
  await expect(card.getByText("Net cost")).toHaveCount(0); // a build only shows what its parts cost
  await expect(card.getByText("used until 01.01.2023")).toBeVisible();
  await expect(card.getByRole("link", { name: device.name })).toBeVisible();

  // selling the GPU takes it out of the build
  await card.getByRole("button", { name: `Edit ${gpuName}` }).click();
  dialog = page.getByRole("dialog");
  await fillMoney(page, "Sell price", "430");
  await expect(dialog.getByText("Sold parts aren't in a build any more.")).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Add the parts of this build")).toBeVisible();
  const loose = page.locator(".mantine-Card-root", { hasText: "Parts without a build" });
  await expect(row(loose, gpuName)).toContainText("0,51 €/day"); // (800 € − 430 €) / 730 days
  await expect(row(loose, gpuName)).toHaveCSS("opacity", "0.6"); // sold

  // a part bought without a build, then the list of all parts
  await page.getByRole("button", { name: "Add part" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name" }).fill(`Spare SSD ${device.id}`);
  await dialog.getByRole("textbox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Storage" }).click();
  await fillMoney(page, "Buy price", "60");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(row(loose, `Spare SSD ${device.id}`)).toHaveCSS("opacity", "1");
  await page.getByText("All parts").click();
  await expect(row(page, gpuName)).toContainText("0,51 €/day");
  await expect(row(page, gpuName)).toHaveCSS("opacity", "1"); // greyed out only in "Parts without a build"
  await expect(row(page, `Spare SSD ${device.id}`)).toContainText("Storage");
  await expect(row(page, `Spare SSD ${device.id}`)).toContainText("in use");
});

test("buy a whole PC, sell two of its parts together, see what's left", async ({ page }) => {
  const id = Date.now();
  const [pcName, gpu, cpu] = [`Used PC ${id}`, `RTX ${id}`, `i5 ${id}`];
  const row = (scope: Page | Locator, part: string) => scope.getByRole("row", { name: new RegExp(part) });

  await page.goto("/pc");
  await page.getByRole("button", { name: "Add purchase" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(pcName);
  await fillMoney(page, "Price", "400");
  await dialog.getByRole("textbox", { name: "Split the price" }).click();
  await page.getByRole("option", { name: "Proportional to the parts' values" }).click();
  await dialog.getByRole("textbox", { name: "Part" }).fill(gpu);
  await dialog.getByRole("textbox", { name: "Category" }).click();
  await page.getByRole("option", { name: "GPU" }).click();
  await dialog.getByRole("textbox", { name: "Value" }).fill("300");
  await dialog.getByRole("button", { name: "Add part" }).click();
  await dialog.getByRole("textbox", { name: "Part" }).nth(1).fill(cpu);
  await dialog.getByRole("textbox", { name: "Category" }).nth(1).click();
  await page.getByRole("option", { name: "CPU" }).click();
  await dialog.getByRole("textbox", { name: "Value" }).nth(1).fill("100");
  await expect(dialog.getByText("300,00 €", { exact: true })).toBeVisible();
  await expect(dialog.getByText("100,00 €", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`Purchase “${pcName}” saved`)).toBeVisible();

  // sell both together, picked in the list of all parts
  await page.getByText("All parts").click();
  await row(page, gpu).getByRole("checkbox").check();
  await row(page, cpu).getByRole("checkbox").check();
  await expect(page.getByText("2 parts selected")).toBeVisible();
  await page.getByRole("button", { name: "Sell together" }).click();
  dialog = page.getByRole("dialog");
  await fillMoney(page, "Sold for", "200");
  await expect(row(dialog, gpu)).toContainText("150,00 €"); // by buy price: 300 € : 100 €
  await expect(row(dialog, cpu)).toContainText("50,00 €");
  await dialog.getByRole("button", { name: "Sell", exact: true }).click();
  await expect(page.getByText("Sold 2 parts together")).toBeVisible();
  await expect(row(page, gpu)).toContainText("together");
  await expect(row(page, gpu)).toContainText(`from ${pcName}`);

  await page.getByText("Purchases").click();
  const card = page.locator(".mantine-Card-root", { hasText: pcName });
  await expect(card.getByText("2 of 2 parts")).toBeVisible();
  await expect(card).toContainText("Sold so far200,00 €");
  await expect(card).toContainText("What's left200,00 €");

  // the sale is edited from one of its parts; deleting it makes both unsold again
  await card.getByRole("button", { name: `Edit ${gpu}` }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "Sell price" })).toBeDisabled();
  await expect(dialog.getByRole("textbox", { name: "Buy price" })).toBeDisabled(); // set by the purchase
  await dialog.getByRole("button", { name: "Edit sale" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete sale" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Sale deleted")).toBeVisible();
  await expect(card.getByText("0 of 2 parts")).toBeVisible();
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
