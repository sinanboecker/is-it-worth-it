import type { ItemSummary } from "@/api/types";
import { combineGroup, groupSameGames, mainEntry } from "./titles";

const item = (
  id: number,
  fields: { key?: string | null; rawgKey?: string; rawg?: number | null; kind?: "game" | "hardware"; hours?: number; bought?: string },
) =>
  ({
    id,
    kind: fields.kind ?? "game",
    title_key: fields.kind === "hardware" ? null : (fields.key ?? `game ${id}`),
    rawg_title_key: fields.rawgKey ?? null,
    rawg_id: fields.rawg ?? null,
    value: { hours: fields.hours ?? 0 },
    copies_summary: { first_bought_on: fields.bought ?? null },
  }) as unknown as ItemSummary;

const ids = (groups: ItemSummary[][]) => groups.map((g) => g.map((i) => i.id));

test("games with the same name or RAWG game are grouped; hardware never", () => {
  const items = [
    item(1, { key: "ghost of tsushima" }),
    item(2, { key: "zelda" }),
    item(3, { key: "ghost of tsushima", rawg: 7 }),
    item(4, { key: "ghost of tsushima director s cut", rawg: 7 }),
    item(5, { kind: "hardware" }),
    item(6, { kind: "hardware" }),
  ];
  expect(ids(groupSameGames(items))).toEqual([[1, 3, 4], [2], [5], [6]]);
});

test("a game matched on RAWG joins an unmatched one by RAWG's name", () => {
  const items = [item(1, { key: "mafia the old country" }), item(2, { key: "mafia ps5", rawgKey: "mafia the old country", rawg: 3 })];
  expect(ids(groupSameGames(items))).toEqual([[1, 2]]);
});

test("an item can join two groups into one", () => {
  const items = [item(1, { key: "a" }), item(2, { key: "b", rawg: 9 }), item(3, { key: "a", rawg: 9 }), item(4, { key: "b" })];
  const groups = ids(groupSameGames(items));
  expect(groups).toHaveLength(1);
  expect([...groups[0]].sort()).toEqual([1, 2, 3, 4]);
});

test("the main entry is the most played, else the newest", () => {
  expect(mainEntry([item(1, { hours: 2 }), item(2, { hours: 10 })]).id).toBe(2);
  expect(mainEntry([item(1, { bought: "2020-01-01" }), item(2, { bought: "2024-01-01" })]).id).toBe(2);
  expect(mainEntry([item(1, {}), item(2, {})]).id).toBe(1);
});

test("a combined game adds up hours, cost and finishes of its platforms", () => {
  const withValue = (id: number, hours: number, net: number, finished: number) =>
    ({
      ...item(id, { key: "ghost", hours }),
      value: { hours, net_cost_cents: net, dlc_cost_cents: 0, total_paid_cents: net, times_finished: finished, last_finished_on: null, threshold_cph: 300 },
    }) as unknown as ItemSummary;
  const combined = combineGroup([withValue(1, 10, 6000, 1), withValue(2, 30, 2000, 0)]);
  expect(combined.id).toBe(2); // the most played one
  expect(combined.value).toMatchObject({ hours: 40, net_cost_cents: 8000, times_finished: 1, cost_per_hour_cents: 200, worth_it: true });
  const single = withValue(3, 1, 9000, 0);
  expect(combineGroup([single])).toBe(single);
});
