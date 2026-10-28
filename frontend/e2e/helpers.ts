import type { APIRequestContext, Locator, Page } from "@playwright/test";

/** Test data through the API; the flows under test go through the UI. */
export async function setup(request: APIRequestContext) {
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

export async function fillMoney(page: Page, label: string, value: string) {
  const input = page.getByRole("dialog").getByRole("textbox", { name: label, exact: true });
  await input.fill(value);
}

/** Mantine's SegmentedControl moves its radio inputs off-screen; click the visible label instead. */
export async function pickSegment(scope: Locator | Page, name: string) {
  const id = await scope.getByRole("radio", { name, exact: true }).getAttribute("id");
  await scope.locator(`label[for="${id}"]`).click();
}
