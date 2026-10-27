import { expect, test, type Locator, type Page } from "@playwright/test";
import { fillMoney, setup } from "./helpers";

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
