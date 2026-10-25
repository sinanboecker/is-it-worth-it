import { IconBrandXbox, IconFolder } from "@tabler/icons-react";
import { categoryIcon, guessIcon, IconPlayStation } from "./CategoryIcon";

const guess = (name: string, type: "platform" | "hardware_only" = "platform") => guessIcon({ name, type });

test("automatic icons are guessed from the category name", () => {
  for (const name of ["PC", "Steam", "Gaming PC"]) expect(guess(name)).toBe("pc");
  for (const name of ["PlayStation", "Playstation 5", "PS5", "PS Vita", "PSP"]) expect(guess(name)).toBe("playstation");
  for (const name of ["Nintendo", "Nintendo Switch", "Switch 2", "Wii U", "3DS"]) expect(guess(name)).toBe("nintendo");
  for (const name of ["Xbox", "XBOX Series X"]) expect(guess(name)).toBe("xbox");
  for (const name of ["Handhelds", "Game Boy", "Steam Deck"]) expect(guess(name)).toBe("handheld");
});

test("hardware-only categories guess the handheld, everything else the folder", () => {
  expect(guess("Handhelds & Other Hardware", "hardware_only")).toBe("handheld");
  expect(guess("Other stuff", "hardware_only")).toBe("handheld");
  for (const name of ["Board games", "Specials", "Epson"]) expect(guess(name)).toBe("folder");
});

test("a chosen icon wins over the guess", () => {
  expect(categoryIcon({ name: "PS5", type: "platform", icon: null })).toBe(IconPlayStation);
  expect(categoryIcon({ name: "PS5", type: "platform", icon: "xbox" })).toBe(IconBrandXbox);
  expect(categoryIcon({ name: "Xbox", type: "platform", icon: "folder" })).toBe(IconFolder);
});
