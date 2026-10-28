import type { Bundle } from "@/api/types";

export type BundleTotals = {
  count: number;
  spentCents: number; // what the bundles cost
  earnedCents: number; // what their games and keys were sold for
  costCents: number; // spent − earned
  hours: number;
  costPerHourCents: number | null;
};

/** Totals of several bundles. A game that is in more than one of them counts its hours once. */
export function bundleTotals(bundles: Bundle[]): BundleTotals {
  const gameHours = new Map<number, number>();
  for (const bundle of bundles) {
    for (const copy of bundle.copies) {
      if (copy.kind === "game") gameHours.set(copy.item_id, copy.value?.hours ?? 0);
    }
  }
  const spentCents = bundles.reduce((sum, b) => sum + b.total_price_cents, 0);
  const earnedCents = bundles.reduce((sum, b) => sum + b.sold_cents, 0);
  const hours = Math.round([...gameHours.values()].reduce((sum, h) => sum + h, 0) * 100) / 100;
  return {
    count: bundles.length,
    spentCents,
    earnedCents,
    costCents: spentCents - earnedCents,
    hours,
    costPerHourCents: hours > 0 ? Math.round((spentCents - earnedCents) / hours) : null,
  };
}

/** Years with bundles, newest first. */
export const bundleYears = (bundles: Bundle[]) =>
  [...new Set(bundles.map((b) => Number(b.buy_date.slice(0, 4))))].sort((a, b) => b - a);
