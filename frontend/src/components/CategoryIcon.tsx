import { IconBrandXbox, IconDeviceDesktop, IconDeviceNintendo, IconFolder } from "@tabler/icons-react";
import type { ComponentType, ReactNode } from "react";
import type { Category } from "@/api/types";

type IconProps = { size?: number | string };

/** Tabler-style outline icon (24 × 24 grid, 2 px round strokes) for icons Tabler doesn't have. */
function OutlineIcon({ size = 24, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** PlayStation: the four face button symbols (△ ○ ✕ □). */
export function IconPlayStation(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <path d="M6.5 3.5l3 5h-6z" />
      <circle cx="17.5" cy="6.5" r="3" />
      <path d="M4 15l5 5M9 15l-5 5" />
      <rect x="14.5" y="14.5" width="6" height="6" rx="0.5" />
    </OutlineIcon>
  );
}

/** Handheld console (Game Boy style): screen, d-pad, two buttons. */
export function IconHandheld(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <rect x="8" y="5" width="8" height="6" rx="1" />
      <path d="M9 14v4M7 16h4" />
      <circle cx="15" cy="17" r=".5" />
      <circle cx="16.5" cy="14.5" r=".5" />
    </OutlineIcon>
  );
}

const RULES: [RegExp, ComponentType<IconProps>][] = [
  [/xbox/, IconBrandXbox],
  [/playstation|\bps ?([1-5]|vita|p)?\b/, IconPlayStation],
  [/nintendo|switch|\bwii|gamecube|\b3?ds\b/, IconDeviceNintendo],
  [/handheld|game ?boy|steam ?deck|retro/, IconHandheld],
  [/\bpc\b|steam|computer|windows|\bgog\b|epic/, IconDeviceDesktop],
];

/** Icon for a category, guessed from its name; hardware-only categories (e.g. "Handhelds & Other Hardware") get the handheld. */
export function categoryIcon(category: Pick<Category, "name" | "type">): ComponentType<IconProps> {
  const name = category.name.toLowerCase();
  const match = RULES.find(([pattern]) => pattern.test(name));
  if (match) return match[1];
  return category.type === "hardware_only" ? IconHandheld : IconFolder;
}
