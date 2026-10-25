import { IconBrandXbox, IconFolder } from "@tabler/icons-react";
import { categoryIcon, IconPlayStation } from "./CategoryIcon";

test("categories show their chosen icon, the folder when none is set", () => {
  expect(categoryIcon({ icon: "playstation" })).toBe(IconPlayStation);
  expect(categoryIcon({ icon: "xbox" })).toBe(IconBrandXbox);
  expect(categoryIcon({ icon: null })).toBe(IconFolder);
});
