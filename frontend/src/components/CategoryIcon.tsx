import { IconBrandXbox, IconDeviceDesktop, IconDeviceNintendo, IconFolder } from "@tabler/icons-react";
import type { ComponentType, ReactNode } from "react";
import type { Category, CategoryIconName } from "@/api/types";

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

/** PlayStation 4: flat slab with slanted ends and the groove across the middle. */
export function IconPs4(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <path d="M5 6h16l-2 12h-16z" />
      <path d="M4 12h16" />
    </OutlineIcon>
  );
}

/** PlayStation 5: the tall core between two curved side panels. */
export function IconPs5(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <path d="M10 5v14h4v-14z" />
      <path d="M10 3c-3 0 -5 2 -5 5v9c0 2 2 4 5 4" />
      <path d="M14 3c3 0 5 2 5 5v9c0 2 -2 4 -5 4" />
    </OutlineIcon>
  );
}

/** Nintendo Switch 2: wide screen between two Joy-Cons with their sticks. */
export function IconSwitch2(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <rect x="2" y="6" width="20" height="12" rx="3" />
      <path d="M7 6v12M17 6v12" />
      <path d="M3.5 10a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" fill="currentColor" />
      <path d="M18.5 14a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" fill="currentColor" />
    </OutlineIcon>
  );
}

/** Xbox 360: standing console with concave sides and the ring of light. */
export function IconXbox360(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <path d="M5 3h14c-1.5 3 -1.5 15 0 18h-14c1.5 -3 1.5 -15 0 -18z" />
      <circle cx="12" cy="8" r="2" />
    </OutlineIcon>
  );
}

/** Xbox One: wide box, vented on the left, power button on the glossy right side. */
export function IconXboxOne(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <rect x="2" y="7" width="20" height="10" rx="1" />
      <path d="M14 7v10" />
      <path d="M5 10v4M8 10v4M11 10v4" />
      <circle cx="18" cy="12" r="1" />
    </OutlineIcon>
  );
}

/** Xbox Series X: tall tower with the round vent on top. */
export function IconXboxSeries(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <rect x="6" y="2" width="12" height="20" rx="1.5" />
      <circle cx="12" cy="7" r="3" />
      <path d="M9 18h2" />
    </OutlineIcon>
  );
}

export const CATEGORY_ICONS: Record<CategoryIconName, { label: string; icon: ComponentType<IconProps> }> = {
  pc: { label: "PC", icon: IconDeviceDesktop },
  playstation: { label: "PlayStation", icon: IconPlayStation },
  ps4: { label: "PlayStation 4", icon: IconPs4 },
  ps5: { label: "PlayStation 5", icon: IconPs5 },
  nintendo: { label: "Nintendo", icon: IconDeviceNintendo },
  switch2: { label: "Nintendo Switch 2", icon: IconSwitch2 },
  xbox: { label: "Xbox", icon: IconBrandXbox },
  xbox360: { label: "Xbox 360", icon: IconXbox360 },
  xbox_one: { label: "Xbox One", icon: IconXboxOne },
  xbox_series: { label: "Xbox Series", icon: IconXboxSeries },
  handheld: { label: "Handheld", icon: IconHandheld },
  folder: { label: "Folder", icon: IconFolder },
};

/** Sidebar icon of a category: the chosen one, the folder when none is set. */
export function categoryIcon(category: Pick<Category, "icon">): ComponentType<IconProps> {
  return CATEGORY_ICONS[category.icon ?? "folder"].icon;
}

/** Renders a category's icon (see `categoryIcon`). */
export function CategoryIconFor({ category, size = 18 }: { category: Pick<Category, "icon">; size?: number | string }) {
  const Icon = categoryIcon(category);
  return <Icon size={size} />;
}
