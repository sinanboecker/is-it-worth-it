import { expect, test } from "@playwright/test";
import { fillMoney } from "./helpers";

test("add a camera body and a lens, sell the body, see the totals", async ({ page }) => {
  const id = Date.now();
  const body = `X-T4 ${id}`;
  const lens = `XF 35mm ${id}`;

  await page.goto("/dashboard");
  await page.getByRole("navigation").getByRole("link", { name: "Camera" }).click();
  await page.getByRole("button", { name: "Add gear" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name" }).fill(body);
  await dialog.getByRole("textbox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Camera body" }).click();
  await dialog.getByRole("textbox", { name: "Manufacturer" }).fill("Fujifilm");
  await dialog.getByRole("textbox", { name: "Bought on" }).fill("01.03.2021");
  await fillMoney(page, "Price", "1500");
  await dialog.getByRole("textbox", { name: "Note" }).fill("with grip");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${body} saved`)).toBeVisible();

  // "+" on the bodies header row starts with that group; the lens group is picked in the dialog instead
  await page.getByRole("button", { name: "Add to Camera bodies" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "Category" })).toHaveValue("Camera body");
  await dialog.getByRole("textbox", { name: "Name" }).fill(lens);
  await dialog.getByRole("textbox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Lens" }).click();
  await dialog.getByRole("textbox", { name: "Manufacturer" }).click();
  await page.getByRole("option", { name: "Fujifilm" }).click(); // offered from the body
  await fillMoney(page, "Price", "400");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${lens} saved`)).toBeVisible();

  const bodyRow = page.getByRole("row", { name: new RegExp(body) });
  await expect(bodyRow).toContainText("Fujifilm");
  await expect(bodyRow).toContainText("01.03.2021");
  await expect(bodyRow).toContainText("with grip");
  await bodyRow.getByRole("button", { name: `Edit ${body}` }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Sold on" }).fill("01.05.2024");
  await fillMoney(page, "Sold for", "900");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${body} saved`)).toBeVisible();
  await expect(bodyRow).toContainText("900,00 €");
  await expect(bodyRow).toContainText("600,00 €"); // total: 1.500 − 900

  await page.getByRole("button", { name: "Add gear" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name" }).fill(`EF-FX ${id}`);
  await dialog.getByRole("textbox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Adapter" }).click();
  await fillMoney(page, "Price", "150");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`EF-FX ${id} saved`)).toBeVisible();

  // one table by group: each group's header row, then its gear
  const rows = page.getByRole("row");
  const order = await rows.allInnerTexts();
  const at = (text: string) => order.findIndex((r) => r.includes(text));
  expect(at("Camera bodies")).toBeLessThan(at(body));
  expect(at(body)).toBeLessThan(at("Lenses"));
  expect(at("Lenses")).toBeLessThan(at(lens));
  expect(at(lens)).toBeLessThan(at("Adapters"));
  expect(at("Adapters")).toBeLessThan(at(`EF-FX ${id}`));
});
