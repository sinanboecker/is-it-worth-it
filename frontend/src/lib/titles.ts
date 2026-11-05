import type { ItemSummary } from "@/api/types";

/** Items that are the same game on several platforms: same `title_key` (the name, loosely compared) or the same
 * RAWG game. Hardware is never grouped. Groups keep the order of their first item. */
export function groupSameGames(items: ItemSummary[]): ItemSummary[][] {
  const groups: ItemSummary[][] = [];
  const byKey = new Map<string, ItemSummary[]>();
  for (const item of items) {
    const keys = item.kind === "game" ? [`name:${item.title_key}`, ...(item.rawg_id ? [`rawg:${item.rawg_id}`] : [])] : [];
    // the groups this item joins (it can link two groups: one by name, one by RAWG id)
    const found = [...new Set(keys.map((k) => byKey.get(k)).filter((g) => g !== undefined))];
    let group = found[0];
    if (!group) {
      group = [];
      groups.push(group);
    }
    for (const other of found.slice(1)) {
      group.push(...other);
      groups.splice(groups.indexOf(other), 1);
      for (const [k, g] of byKey) if (g === other) byKey.set(k, group);
    }
    group.push(item);
    for (const k of keys) byKey.set(k, group);
  }
  return groups;
}

/** The entry to open for a group: the most played one, else the most recently bought, else the first. */
export function mainEntry(group: ItemSummary[]): ItemSummary {
  const score = (i: ItemSummary) => [i.value?.hours ?? 0, i.copies_summary.first_bought_on ?? ""] as const;
  return group.reduce((best, i) => {
    const [h, b] = score(i);
    const [bh, bb] = score(best);
    return h > bh || (h === bh && b > bb) ? i : best;
  });
}
