import type { Journal, JournalEntry } from "@/api/types";

export type JournalTotals = {
  games: number; // distinct games finished
  finishes: number; // including replays
  hours: number; // hours of the finished games, each game once
  rated: number;
  averageRating: number | null;
  ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>; // games per whole star (half stars rounded down)
  perCategory: { categoryId: number; games: number }[]; // most games first
};

export const allEntries = (journal: Journal): JournalEntry[] => [
  ...journal.years.flatMap((y) => y.months.flatMap((m) => m.entries)),
  ...(journal.unknown_date ?? []),
];

/** Totals of all finished games: a game finished several times (replays) counts once. */
export function journalTotals(journal: Journal): JournalTotals {
  const entries = allEntries(journal);
  const games = new Map<number, JournalEntry>();
  for (const entry of entries) games.set(entry.item_id, entry);
  const list = [...games.values()];
  const ratings = list.map((g) => g.rating).filter((r): r is number => r !== null && r > 0);
  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) if (r >= 1) ratingCounts[Math.floor(r) as 1 | 2 | 3 | 4 | 5] += 1;
  const categories = new Map<number, number>();
  for (const g of list) categories.set(g.category_id, (categories.get(g.category_id) ?? 0) + 1);
  return {
    games: list.length,
    finishes: entries.length,
    hours: Math.round(list.reduce((sum, g) => sum + g.hours, 0) * 10) / 10,
    rated: ratings.length,
    averageRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    ratingCounts,
    perCategory: [...categories].map(([categoryId, count]) => ({ categoryId, games: count })).sort((a, b) => b.games - a.games),
  };
}
