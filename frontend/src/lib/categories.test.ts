import type { Category } from "@/api/types";
import { categoryLookup } from "./categories";

test("names and order come from the categories as listed", () => {
  const categories = [{ id: 5, name: "PS5" }, { id: 2, name: "PC" }] as Category[];
  const lookup = categoryLookup(categories);
  expect(lookup.name(2)).toBe("PC");
  expect(lookup.name(99)).toBe("");
  expect(lookup.names([2, 5])).toBe("PS5 · PC");
  expect(categoryLookup(undefined).names([1])).toBe("");
});
