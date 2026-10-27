import { expect, test } from "@playwright/test";
import path from "node:path";
import { setup } from "./helpers";

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

test("import finish dates: fill an unknown date and pick a game by hand", async ({ page, request }) => {
  const { category } = await setup(request);
  const id = category.id;
  const game = async (name: string) =>
    (await request.post("/api/v1/items", {
      data: { category_id: id, kind: "game", name, first_copy: { buy_date: "2023-01-01", buy_price_cents: 1000 } },
    })).json();
  const alan = await game(`Alan Wake ${id}`);
  await request.post(`/api/v1/items/${alan.id}/completions`, { data: { finished_on: null } }); // ✓ without a date
  const dredge = await game(`Dredge ${id}`);
  const list = ["February, 2024", `19 Alan Wake ${id}, PC`, "", "June, 2023", `19 The Dredge thing ${id}, PC`].join("\n");

  await page.goto("/journal");
  await page.getByRole("button", { name: "Import finish dates" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "done_dates", mimeType: "text/plain", buffer: Buffer.from(list) });
  await dialog.getByRole("button", { name: "Preview" }).click();
  await expect(dialog.getByText("To check (1)")).toBeVisible();
  await expect(dialog.getByText("not found")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Game for line 5" }).fill(`Dredge ${id}`);
  await page.getByRole("option", { name: new RegExp(`Dredge ${id}`) }).click();
  await expect(dialog.getByText("picked")).toBeVisible();
  await dialog.getByText("All (2)").click();
  await expect(dialog.getByText("fills the date")).toBeVisible();
  await dialog.getByRole("button", { name: "Import 2 finishes" }).click();
  await expect(page.getByText("Finish dates imported: 1 dates filled in, 1 finishes added")).toBeVisible();

  const finished = async (item: { id: number }) =>
    (await (await request.get(`/api/v1/items/${item.id}`)).json()).completions.map((c: { finished_on: string }) => c.finished_on);
  expect(await finished(alan)).toEqual(["2024-02-19"]);
  expect(await finished(dredge)).toEqual(["2023-06-19"]);
});
