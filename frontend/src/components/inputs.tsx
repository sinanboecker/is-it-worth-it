import { ActionIcon, Autocomplete, Group, NumberInput, Rating, Select, Text, Tooltip, type NumberInputProps } from "@mantine/core";
import { IconHeart, IconHeartFilled } from "@tabler/icons-react";
import { DateInput, type DateInputProps } from "@mantine/dates";
import { useCategories, useHardware, useStores } from "@/api/queries";
import { fromCents, parseTypedDate, toCents } from "@/lib/format";
import { STATUS_OPTIONS } from "@/lib/labels";
import type { GameStatus } from "@/api/types";

type MoneyInputProps = Omit<NumberInputProps, "value" | "onChange"> & {
  value: number | null | undefined; // cents
  onChange: (cents: number | null) => void;
};

/** Euro input with German formatting; value in cents. */
export function MoneyInput({ value, onChange, ...props }: MoneyInputProps) {
  return (
    <NumberInput
      decimalSeparator=","
      thousandSeparator="."
      decimalScale={2}
      fixedDecimalScale
      min={0}
      suffix=" €"
      hideControls
      {...props}
      value={fromCents(value)}
      onChange={(v) => onChange(toCents(v))}
    />
  );
}

type HoursInputProps = Omit<NumberInputProps, "value" | "onChange"> & {
  value: number;
  onChange: (hours: number) => void;
};

export function HoursInput({ value, onChange, ...props }: HoursInputProps) {
  return (
    <NumberInput
      decimalSeparator=","
      decimalScale={2}
      min={0}
      step={0.5}
      suffix=" h"
      {...props}
      value={value}
      onChange={(v) => onChange(typeof v === "number" ? v : Number(String(v).replace(",", ".")) || 0)}
    />
  );
}

type DateFieldProps = Omit<DateInputProps, "value" | "onChange"> & {
  value: string | null | undefined; // YYYY-MM-DD
  onChange: (iso: string | null) => void;
};

export function DateField({ value, onChange, ...props }: DateFieldProps) {
  return (
    <DateInput
      valueFormat="DD.MM.YYYY"
      dateParser={parseTypedDate}
      firstDayOfWeek={1}
      {...props}
      value={value ?? null}
      onChange={(v) => onChange(v ? String(v).slice(0, 10) : null)}
    />
  );
}

/** Read-only or editable star rating in 0.5 steps (null = not rated). */
export function Stars({
  value,
  onChange,
  size = "sm",
}: {
  value: number | null | undefined;
  onChange?: (stars: number | null) => void;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  if (!onChange) {
    return value === null || value === undefined ? (
      <Text c="dimmed" size="sm">
        –
      </Text>
    ) : (
      <Rating value={value} fractions={2} readOnly size={size} />
    );
  }
  return (
    <Group gap="xs">
      <Rating value={value ?? 0} fractions={2} size={size} onChange={(v) => onChange(v || null)} />
      {value !== null && value !== undefined && (
        <Text size="xs" c="dimmed" style={{ cursor: "pointer" }} onClick={() => onChange(null)}>
          clear
        </Text>
      )}
    </Group>
  );
}

export function StoreInput({
  value,
  onChange,
  label = "Store",
}: {
  value: string | null | undefined;
  onChange: (store: string | null) => void;
  label?: string;
}) {
  const stores = useStores();
  return (
    <Autocomplete
      label={label}
      placeholder="Steam, eShop, MediaMarkt, …"
      data={stores.data ?? []}
      value={value ?? ""}
      onChange={(v) => onChange(v.trim() ? v : null)}
    />
  );
}

/** Device picker over all hardware (any category), grouped by category. */
export function DeviceSelect({
  value,
  onChange,
  label = "Device",
  exclude = [],
  required,
  clearable = true,
}: {
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  label?: string;
  exclude?: number[];
  required?: boolean;
  clearable?: boolean;
}) {
  const hardware = useHardware();
  const categories = useCategories();
  const names = new Map(categories.data?.map((c) => [c.id, c.name]));
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const device of hardware.data ?? []) {
    if (exclude.includes(device.id) && device.id !== value) continue;
    const group = names.get(device.category_id) ?? "Other";
    groups.set(group, [...(groups.get(group) ?? []), { value: String(device.id), label: device.name }]);
  }
  return (
    <Select
      label={label}
      placeholder={hardware.data?.length ? "Choose a device" : "No hardware yet"}
      data={[...groups].map(([group, items]) => ({ group, items }))}
      value={value ? String(value) : null}
      onChange={(v) => onChange(v ? Number(v) : null)}
      searchable
      clearable={clearable}
      required={required}
      nothingFoundMessage="No device found"
    />
  );
}

export function StatusSelect({
  value,
  onChange,
  label = "Status",
  allowWishlist = true,
}: {
  value: GameStatus | null | undefined;
  onChange: (status: GameStatus) => void;
  label?: string;
  allowWishlist?: boolean;
}) {
  return (
    <Select
      label={label}
      data={STATUS_OPTIONS.filter((o) => allowWishlist || o.value !== "wishlist")}
      value={value ?? null}
      onChange={(v) => v && onChange(v as GameStatus)}
      allowDeselect={false}
    />
  );
}

/** Heart to mark a game as favorite; without onChange it's only shown when set. */
export function FavoriteHeart({
  value,
  onChange,
  size = "md",
}: {
  value: boolean;
  onChange?: (favorite: boolean) => void;
  size?: "sm" | "md" | "lg";
}) {
  const iconSize = { sm: 14, md: 20, lg: 24 }[size];
  if (!onChange) {
    return value ? <IconHeartFilled size={iconSize} color="var(--mantine-color-red-6)" aria-label="Favorite" /> : null;
  }
  return (
    <Tooltip label={value ? "Remove from favorites" : "Add to favorites"}>
      <ActionIcon
        variant="subtle"
        color="red"
        size={size}
        aria-label={value ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={value}
        onClick={() => onChange(!value)}
      >
        {value ? <IconHeartFilled size={iconSize} /> : <IconHeart size={iconSize} />}
      </ActionIcon>
    </Tooltip>
  );
}
