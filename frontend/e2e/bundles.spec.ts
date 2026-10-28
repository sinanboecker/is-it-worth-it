import { expect, test } from "@playwright/test";
import { fillMoney, pickSegment, setup } from "./helpers";

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

test("the bundles page adds up all bundles, or the bundles of one year", async ({ page, request }) => {
  const { category, device } = await setup(request);
  const bundle = await (
    await request.post("/api/v1/bundles", {
      data: {
        name: `Old bundle ${category.id}`,
        buy_date: "2009-05-01",
        total_price_cents: 2000,
        other_sales_cents: 500,
        split_mode: "equal",
        entries: ["b game", "A game"].map((n) => ({ new_item: { category_id: category.id, kind: "game", name: `${n} ${category.id}` }, format: "digital" })),
      },
    })
  ).json();
  await request.post(`/api/v1/items/${bundle.copies[0].item_id}/hours`, { data: { hours: 6, hardware_id: device.id } });

  await page.goto("/bundles");
  const totals = page.locator(".mantine-Card-root", { hasText: "All bundles" });
  await expect(totals.getByRole("textbox", { name: "Year" })).toHaveValue("Total");
  await totals.getByRole("textbox", { name: "Year" }).click();
  await page.getByRole("option", { name: "2009" }).click();
  const year = page.locator(".mantine-Card-root", { hasText: "Bundles bought in 2009" });
  await expect(year.getByText("1 bundle", { exact: true })).toBeVisible();
  await expect(year).toContainText("Money spent20,00 €");
  await expect(year).toContainText("Money earned5,00 €");
  await expect(year).toContainText("Total cost15,00 €");
  await expect(year).toContainText("Hours6 h");
  await expect(year).toContainText("Cost per hour2,50 €/h"); // 15 € / 6 h

  // each bundle's games are sorted by name, or by the column picked (remembered for all bundles)
  const card = page.locator(".mantine-Card-root", { hasText: `Old bundle ${category.id}` });
  const games = card.getByRole("link", { name: /game/ });
  await expect(games).toHaveText([`A game ${category.id}`, `b game ${category.id}`]);
  await card.getByRole("button", { name: "Hours", exact: true }).click();
  await card.getByRole("button", { name: "Hours", exact: true }).click(); // most hours first
  await expect(card.getByRole("columnheader", { name: "Hours" })).toHaveAttribute("aria-sort", "descending");
  await expect(games).toHaveText([`b game ${category.id}`, `A game ${category.id}`]); // b has the 6 h
  await page.reload();
  await expect(games).toHaveText([`b game ${category.id}`, `A game ${category.id}`]);
});

test("sold bundle keys are not redeemed and have their own view on the category page", async ({ page, request }) => {
  const { category } = await setup(request);
  const [kept, sold] = [`Kept key ${category.id}`, `Sold key ${category.id}`];
  const bundle = await (
    await request.post("/api/v1/bundles", {
      data: {
        name: `Keys ${category.id}`,
        buy_date: "2025-01-01",
        total_price_cents: 1200,
        split_mode: "equal",
        entries: [kept, sold].map((name) => ({ new_item: { category_id: category.id, kind: "game", name }, format: "digital" })),
      },
    })
  ).json();
  const key = bundle.copies[1];
  await request.patch(`/api/v1/items/${key.item_id}/copies/${key.copy_id}`, { data: { sell_price_cents: 500, sell_date: "2025-02-01" } });

  await page.goto(`/categories/${category.id}`);
  await expect(page.getByRole("row", { name: new RegExp(kept) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(sold) })).toHaveCount(0); // not with the other games
  await pickSegment(page, "Not redeemed");
  await expect(page.getByRole("row", { name: new RegExp(sold) })).toContainText("Not redeemed");
  await expect(page.getByRole("row", { name: new RegExp(kept) })).toHaveCount(0);
});
