import type { ItemSummary } from "@/api/types";
import { groupSameGames, mainEntry } from "./titles";

const item = (id: number, fields: { key?: string | null; rawg?: number | null; kind?: "game" | "hardware"; hours?: number; bought?: string }) =>
  ({
    id,
    kind: fields.kind ?? "game",
    title_key: fields.kind === "hardware" ? null : (fields.key ?? `game ${id}`),
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
