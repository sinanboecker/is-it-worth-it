import type { ItemSummary } from "@/api/types";

/** Items that are the same game on several platforms: a name in common (`title_key`, the name loosely compared, or
 * `rawg_title_key`, RAWG's name for it) or the same RAWG game. Hardware is never grouped. Groups keep the order of
 * their first item. */
export function groupSameGames(items: ItemSummary[]): ItemSummary[][] {
  const groups: ItemSummary[][] = [];
  const byKey = new Map<string, ItemSummary[]>();
  for (const item of items) {
    const keys =
      item.kind === "game"
        ? [
            `name:${item.title_key}`,
            ...(item.rawg_title_key ? [`name:${item.rawg_title_key}`] : []),
            ...(item.rawg_id ? [`rawg:${item.rawg_id}`] : []),
          ]
        : [];
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

/** One game on several platforms as one entry: the main entry (see `mainEntry`) with the hours, cost and finishes of
 * all platforms added up; cost per hour and "worth it" are worked out again from those (like app/calc.py does). */
export function combineGroup(group: ItemSummary[]): ItemSummary {
  const main = mainEntry(group);
  const values = group.map((i) => i.value).filter((v) => v !== null && v !== undefined);
  if (group.length === 1 || !main.value || values.length < 2) return main;
  const sum = (pick: (v: (typeof values)[number]) => number) => values.reduce((total, v) => total + pick(v), 0);
  const hoursTotal = Math.round(sum((v) => v.hours) * 100) / 100;
  const netCost = sum((v) => v.net_cost_cents);
  const threshold = main.value.threshold_cph;
  return {
    ...main,
    value: {
      ...main.value,
      hours: hoursTotal,
      net_cost_cents: netCost,
      dlc_cost_cents: sum((v) => v.dlc_cost_cents),
      total_paid_cents: sum((v) => v.total_paid_cents),
      times_finished: sum((v) => v.times_finished),
      last_finished_on: values.map((v) => v.last_finished_on).reduce((a, b) => ((b ?? "") > (a ?? "") ? b : a), null),
      cost_per_hour_cents: hoursTotal > 0 ? Math.round(netCost / hoursTotal) : null,
      worth_it: netCost <= 0 || (hoursTotal > 0 && netCost <= threshold * hoursTotal),
      hours_to_break_even: netCost <= 0 ? 0 : Math.round(Math.max(0, netCost / threshold - hoursTotal) * 10) / 10,
    },
  };
}
