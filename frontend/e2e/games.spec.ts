import { expect, test } from "@playwright/test";
import pkg from "../package.json" with { type: "json" };
import { fillMoney, pickSegment, setup } from "./helpers";

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
  // totals of all finished games instead of the calendar, the game's category among them
  const totals = page.locator(".mantine-Card-root", { hasText: "All finished games" });
  await expect(totals.getByText("Games finished")).toBeVisible();
  await expect(totals.getByText(category.name)).toBeVisible();
  // the lists can be folded away (remembered in the browser)
  await totals.getByRole("button", { name: "Hide details" }).click();
  await expect(totals.getByText(category.name)).toBeHidden();
  await page.reload();
  await expect(totals.getByText("Games finished")).toBeVisible();
  await expect(totals.getByText(category.name)).toBeHidden();
  await totals.getByRole("button", { name: "Categories & ratings" }).click();
  await expect(totals.getByText(category.name)).toBeVisible();
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

  await request.patch(`/api/v1/items/${game.id}`, { data: { release_date: "2017-03-03" } });
  await page.goto(`/items/${game.id}`);
  await page.getByRole("button", { name: "Add to favorites" }).click();
  await expect(page.getByText(`${name} is a favorite ❤`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove from favorites" })).toBeVisible();

  await page.getByRole("link", { name: "Favorites" }).click();
  await expect(page.getByRole("heading", { name: "Favorites" })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();

  // the list shows the release year, and stays the view after a reload
  await pickSegment(page, "List");
  await expect(page.getByRole("columnheader", { name: "Released" })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("2017");
  await page.reload();
  await expect(page.getByRole("radio", { name: "List", exact: true })).toBeChecked();
  await expect(page.getByRole("columnheader", { name: "Released" })).toBeVisible();
  await pickSegment(page, "Grid");

  await page.getByText(name, { exact: true }).click();
  await page.getByRole("button", { name: "Remove from favorites" }).click();
  await page.getByRole("link", { name: "Favorites" }).click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
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
  // a short date, then a click on the day it shows in the calendar: the date stays
  await date.click();
  await date.fill("13.1.22");
  await page.locator("[data-selected]").first().click();
  await date.press("Tab"); // the text is written out in full when leaving the field
  await expect(date).toHaveValue("13.01.2022");
  await date.click();
  await date.fill("5.3.24");
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

test("rate a game and mark it as favorite right in the games list", async ({ page, request }) => {
  const { category } = await setup(request);
  const name = `Unrated ${category.id}`;
  const game = await (
    await request.post("/api/v1/items", {
      data: { category_id: category.id, kind: "game", name, first_copy: { buy_date: "2024-01-01", buy_price_cents: 1000 } },
    })
  ).json();

  await page.goto(`/categories/${category.id}`);
  const row = page.getByRole("row", { name: new RegExp(name) });
  const rating = row.getByRole("cell").nth(2); // name, status, rating
  await expect(rating).toHaveText("–"); // no rating yet
  await rating.hover(); // the stars and the heart become clickable
  await pickSegment(row, "4"); // the fourth star
  await row.getByRole("button", { name: "Add to favorites" }).click();
  await expect(page).toHaveURL(new RegExp(`/categories/${category.id}$`)); // still in the list

  await expect
    .poll(async () => {
      const item = await (await request.get(`/api/v1/items/${game.id}`)).json();
      return [item.rating, item.favorite];
    })
    .toEqual([4, true]);
  await page.mouse.move(0, 0);
  await expect(row.getByLabel("Favorite", { exact: true })).toBeVisible(); // the filled heart, no longer hovered
});

test("tag a copy as won or traded and find it in the category's views", async ({ page, request }) => {
  const { category } = await setup(request);
  const name = `Giveaway ${category.id}`;
  await page.goto(`/categories/${category.id}`);
  await expect(page.getByRole("radio", { name: "Won", exact: true })).toHaveCount(0); // nothing won yet
  await page.getByRole("button", { name: "Game", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await fillMoney(page, "Buy price", "12");
  await dialog.getByLabel("Won (e.g. in a giveaway)").check();
  await expect(dialog.getByRole("textbox", { name: "Buy price", exact: true })).toHaveValue("0,00 €"); // won: free
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(`${name} added`)).toBeVisible();

  await pickSegment(page, "Won");
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row.getByLabel("Won", { exact: true })).toBeVisible(); // the trophy
  await expect(page.getByRole("radio", { name: "Traded", exact: true })).toHaveCount(0);

  await row.click();
  await page.getByRole("button", { name: "Edit copy" }).click();
  await page.getByRole("dialog").getByLabel("Got it in a trade").check();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Copy saved")).toBeVisible();
  await expect(page.getByRole("cell", { name: /won.*traded/ })).toBeVisible(); // both badges on the copy

  await page.goto(`/categories/${category.id}`);
  await pickSegment(page, "Traded");
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
});
