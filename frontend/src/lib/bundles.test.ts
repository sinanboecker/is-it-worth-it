import type { Bundle } from "@/api/types";
import { bundleTotals, bundleYears } from "./bundles";

const game = (itemId: number, hours: number) =>
  ({ item_id: itemId, kind: "game", value: { hours } }) as unknown as Bundle["copies"][number];
const bundle = (buyDate: string, price: number, sold: number, copies: Bundle["copies"]) =>
  ({ buy_date: buyDate, total_price_cents: price, sold_cents: sold, copies }) as unknown as Bundle;

test("totals add up price and sales; a game in two bundles counts its hours once", () => {
  const bundles = [bundle("2025-03-01", 1200, 400, [game(1, 10), game(2, 2.5)]), bundle("2024-02-01", 800, 0, [game(1, 10)])];
  expect(bundleTotals(bundles)).toEqual({
    count: 2,
    spentCents: 2000,
    earnedCents: 400,
    costCents: 1600,
    hours: 12.5,
    costPerHourCents: 128, // 16 € / 12.5 h
  });
  expect(bundleYears(bundles)).toEqual([2025, 2024]);
});

test("without hours there is no cost per hour", () => {
  expect(bundleTotals([bundle("2025-01-01", 800, 1000, [])])).toMatchObject({ costCents: -200, hours: 0, costPerHourCents: null });
});
