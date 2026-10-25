import type { CopyCondition, CopyFormat, GameStatus, SplitMode } from "@/api/types";

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

export const options = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
