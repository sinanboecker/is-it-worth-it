import type { Journal, JournalEntry } from "@/api/types";
import { journalTotals } from "./journal";

const entry = (itemId: number, categoryId: number, hours: number, rating: number | null) =>
  ({ item_id: itemId, category_id: categoryId, hours, rating }) as JournalEntry;

test("totals count each game once and group them by category and rating", () => {
  const journal = {
    years: [
      { year: 2025, months: [{ month: 3, entries: [entry(1, 10, 20, 4.5), entry(2, 10, 5, null)] }] },
      { year: 2019, months: [{ month: 8, entries: [entry(1, 10, 20, 4.5)] }] }, // a replay of game 1
    ],
    unknown_date: [entry(3, 20, 12.25, 3)],
  } as unknown as Journal;
  expect(journalTotals(journal)).toEqual({
    games: 3,
    finishes: 4,
    hours: 37.3,
    rated: 2,
    averageRating: 3.8, // (4.5 + 3) / 2
    ratingCounts: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 0 },
    perCategory: [
      { categoryId: 10, games: 2 },
      { categoryId: 20, games: 1 },
    ],
  });
});

test("no finished games", () => {
  expect(journalTotals({ years: [], unknown_date: [] } as unknown as Journal)).toMatchObject({ games: 0, averageRating: null, perCategory: [] });
});
