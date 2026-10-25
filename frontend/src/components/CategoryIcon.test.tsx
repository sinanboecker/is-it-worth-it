import { IconBrandXbox, IconFolder } from "@tabler/icons-react";
import { categoryIcon, IconPlayStation, IconPs5, IconXboxSeries } from "./CategoryIcon";

test("categories show their chosen icon, the folder when none is set", () => {
  expect(categoryIcon({ icon: "playstation" })).toBe(IconPlayStation);
  expect(categoryIcon({ icon: "ps5" })).toBe(IconPs5);
  expect(categoryIcon({ icon: "xbox_series" })).toBe(IconXboxSeries);
  expect(categoryIcon({ icon: "xbox" })).toBe(IconBrandXbox);
  expect(categoryIcon({ icon: null })).toBe(IconFolder);
});
