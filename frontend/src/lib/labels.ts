import type { CopyCondition, CopyFormat, GameStatus, PcPartCategory, SplitMode } from "@/api/types";

export const STATUS: Record<GameStatus, { label: string; color: string }> = {
  wishlist: { label: "Wishlist", color: "grape" },
  backlog: { label: "Backlog", color: "gray" },
  playing: { label: "Currently playing", color: "blue" },
  on_hold: { label: "On hold", color: "yellow" },
  played: { label: "Played", color: "cyan" },
  finished: { label: "Finished", color: "green" },
  abandoned: { label: "Abandoned", color: "red" },
  endless: { label: "Endless", color: "teal" },
};

export const STATUS_OPTIONS = (Object.keys(STATUS) as GameStatus[]).map((value) => ({
  value,
  label: STATUS[value].label,
}));

export const FORMAT: Record<CopyFormat, string> = { physical: "Physical", digital: "Digital" };
export const CONDITION: Record<CopyCondition, string> = { new: "New", used: "Used" };
export const SPLIT_MODE: Record<SplitMode, string> = {
  proportional: "Proportional to standalone prices",
  equal: "Equal shares",
  manual: "Manual",
};

/** In the order parts are listed within a build. */
export const PC_PART_CATEGORY: Record<PcPartCategory, string> = {
  cpu: "CPU",
  gpu: "GPU",
  mainboard: "Mainboard",
  memory: "Memory",
  storage: "Storage",
  power_supply: "Power supply",
  cooling: "Cooling",
  case: "Case",
  other: "Other",
};

export const options = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
