import { useCategories } from "@/api/queries";
import type { Category } from "@/api/types";

export type CategoryLookup = {
  name: (id: number) => string;
  /** Compares category IDs by the categories' order (as the API lists them: sort order, then name). */
  compare: (a: number, b: number) => number;
  /** The names of several categories in that order, e.g. "PS4 · PS5". */
  names: (ids: number[]) => string;
};

export function categoryLookup(categories: Category[] | undefined): CategoryLookup {
  const byId = new Map(categories?.map((c) => [c.id, c.name]));
  const order = new Map(categories?.map((c, index) => [c.id, index]));
  const compare = (a: number, b: number) => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  const name = (id: number) => byId.get(id) ?? "";
  return { name, compare, names: (ids) => ids.toSorted(compare).map(name).join(" · ") };
}

export const useCategoryLookup = (): CategoryLookup => categoryLookup(useCategories().data);
