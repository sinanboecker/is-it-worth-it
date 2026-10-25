import { IconBrandXbox, IconDeviceDesktop, IconDeviceNintendo, IconFolder } from "@tabler/icons-react";
import { categoryIcon, IconHandheld, IconPlayStation } from "./CategoryIcon";

const icon = (name: string, type: "platform" | "hardware_only" = "platform") => categoryIcon({ name, type });

test("icons are guessed from the category name", () => {
  for (const name of ["PC", "Steam", "Gaming PC"]) expect(icon(name)).toBe(IconDeviceDesktop);
  for (const name of ["PlayStation", "Playstation 5", "PS5", "PS Vita", "PSP"]) expect(icon(name)).toBe(IconPlayStation);
  for (const name of ["Nintendo", "Nintendo Switch", "Switch 2", "Wii U", "3DS"]) expect(icon(name)).toBe(IconDeviceNintendo);
  for (const name of ["Xbox", "XBOX Series X"]) expect(icon(name)).toBe(IconBrandXbox);
  for (const name of ["Handhelds", "Game Boy", "Steam Deck"]) expect(icon(name)).toBe(IconHandheld);
});

test("hardware-only categories get the handheld, everything else the folder", () => {
  expect(icon("Handhelds & Other Hardware", "hardware_only")).toBe(IconHandheld);
  expect(icon("Other stuff", "hardware_only")).toBe(IconHandheld);
  for (const name of ["Retro", "Board games", "Specials", "Epson"]) expect(icon(name)).not.toBe(IconPlayStation);
  expect(icon("Board games")).toBe(IconFolder);
});
