import { Card, Group, ScrollArea, SimpleGrid, Stack, Table, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconSelector } from "@tabler/icons-react";
import { useLocalStorage } from "@mantine/hooks";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ItemSummary } from "@/api/types";
import { day, euros, hours, perHour } from "@/lib/format";
import { CopyBadges, StatusBadge, WorthItBadge } from "./badges";
import { Cover, Empty, imageOf } from "./common";
import { FavoriteHeart, Stars } from "./inputs";

export type Column = {
  key: string;
  label: string;
  render: (item: ItemSummary) => ReactNode;
  sort?: (item: ItemSummary) => number | string;
  align?: "right";
  wrap?: boolean; // default: keep on one line (badges must not be cut off)
};

const nullsLast = (v: number | null | undefined, desc = false) => (v === null || v === undefined ? (desc ? -Infinity : Infinity) : v);

export const COLUMNS: Record<string, Column> = {
  name: {
    key: "name",
    label: "Name",
    render: (i) => (
      <Group gap="sm" wrap="nowrap">
        <Cover name={i.name} path={imageOf(i)} width={56} />
        <Text fw={500} size="sm">
          {i.name}
        </Text>
      </Group>
    ),
    sort: (i) => i.name.toLowerCase(),
    wrap: true,
  },
  status: { key: "status", label: "Status", render: (i) => <StatusBadge status={i.status} />, sort: (i) => i.status ?? "" },
  rating: {
    key: "rating",
    label: "Rating",
    render: (i) => (
      <Group gap={4} wrap="nowrap">
        <Stars value={i.rating} size="xs" />
        <FavoriteHeart value={i.favorite} size="sm" />
      </Group>
    ),
    // favorites first among equal ratings
    sort: (i) => (i.rating ?? -1) + (i.favorite ? 0.01 : 0),
  },
  bought: {
    key: "bought",
    label: "Bought",
    render: (i) => day(i.copies_summary.first_bought_on),
    sort: (i) => i.copies_summary.first_bought_on ?? "",
  },
  hours: { key: "hours", label: "Hours", render: (i) => hours(i.value?.hours), sort: (i) => i.value?.hours ?? -1, align: "right" },
  cost: {
    key: "cost",
    label: "Cost",
    render: (i) => (
      <Text size="sm">
        {euros(i.value?.net_cost_cents)}
        {!!i.value?.dlc_cost_cents && (
          <Text span size="xs" c="dimmed">
            {" "}
            incl. DLC
          </Text>
        )}
      </Text>
    ),
    sort: (i) => i.value?.net_cost_cents ?? -1,
    align: "right",
  },
  cph: {
    key: "cph",
    label: "€/h",
    render: (i) => perHour(i.value?.cost_per_hour_cents),
    sort: (i) => nullsLast(i.value?.cost_per_hour_cents),
    align: "right",
  },
  worth: { key: "worth", label: "Worth it?", render: (i) => <WorthItBadge value={i.value} />, sort: (i) => (i.value?.worth_it ? 0 : (i.value?.hours_to_break_even ?? 1e9)) },
  finished: {
    key: "finished",
    label: "Finished",
    render: (i) => (i.value?.times_finished ? `${i.value.times_finished}×` : ""),
    sort: (i) => i.value?.times_finished ?? 0,
    align: "right",
  },
  devices: {
    key: "devices",
    label: "Devices",
    render: (i) => (
      <Text size="xs" c="dimmed">
        {i.devices
          .filter((d) => d.hours > 0)
          .map((d) => `${d.hardware_name}${d.emulated ? " 🕹" : ""}`)
          .join(", ")}
      </Text>
    ),
    wrap: true,
  },
  copies: { key: "copies", label: "Copies", render: (i) => <CopyBadges item={i} /> },
  games: { key: "games", label: "Games", render: (i) => i.value?.games_played_on ?? 0, sort: (i) => i.value?.games_played_on ?? 0, align: "right" },
  target: { key: "target", label: "Target price", render: (i) => euros(i.target_price_cents), sort: (i) => nullsLast(i.target_price_cents), align: "right" },
};

export const GAME_COLUMNS = ["name", "status", "rating", "bought", "hours", "cost", "cph", "worth", "finished", "devices", "copies"];
export const HARDWARE_COLUMNS = ["name", "bought", "cost", "hours", "games", "cph", "worth", "copies"];

export type Sort = { key: string; desc: boolean };

/** Ascending comparison for sort keys (numbers, or text with natural numbers: "Halo 2" before "Halo 10"). */
export function compareSortKeys(x: number | string, y: number | string): number {
  if (typeof x === "string" && typeof y === "string") return x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Column header that sorts by its column: click to sort, click again to reverse; the sorted column is highlighted. */
export function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align,
  w,
}: {
  label: string;
  sortKey: string;
  sort: Sort;
  onSort: (sort: Sort) => void;
  align?: "right";
  w?: number;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.desc ? IconChevronDown : IconChevronUp) : IconSelector;
  const color = active ? "var(--mantine-primary-color-filled)" : undefined;
  return (
    <Table.Th w={w} style={{ textAlign: align, whiteSpace: "nowrap" }} aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}>
      <UnstyledButton onClick={() => onSort({ key: sortKey, desc: active ? !sort.desc : false })}>
        <Group gap={4} wrap="nowrap" justify={align === "right" ? "flex-end" : undefined}>
          <Text size="sm" fw={active ? 700 : 600} c={color}>
            {label}
          </Text>
          <Icon size={14} color={color} stroke={active ? 2.5 : 2} opacity={active ? 1 : 0.5} />
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

/** The last sort picked in any list, used by all lists (a list without that column uses its own default). */
function useSavedSort() {
  return useLocalStorage<Sort | null>({ key: "item-list-sort", defaultValue: null, getInitialValueInEffect: false });
}

export function ItemTable({
  items,
  columns,
  initialSort = "name",
  empty = "Nothing here yet.",
}: {
  items: ItemSummary[];
  columns: (string | Column)[];
  initialSort?: string;
  empty?: ReactNode;
}) {
  const navigate = useNavigate();
  const [saved, setSaved] = useSavedSort();
  if (!items.length) return <Empty>{empty}</Empty>;

  const cols = columns.map((c) => (typeof c === "string" ? COLUMNS[c] : c));
  const byKey = new Map(cols.map((c) => [c.key, c]));
  const sort: Sort = saved && byKey.get(saved.key)?.sort ? saved : { key: initialSort, desc: false };
  const column = byKey.get(sort.key);
  const sorted = column?.sort
    ? [...items].sort((a, b) => {
        const result = compareSortKeys(column.sort!(a), column.sort!(b));
        return sort.desc ? -result : result;
      })
    : items;

  const header = (col: Column) =>
    col.sort ? (
      <SortHeader key={col.key} label={col.label} sortKey={col.key} sort={sort} onSort={setSaved} align={col.align} />
    ) : (
      <Table.Th key={col.key} style={{ textAlign: col.align, whiteSpace: "nowrap" }}>
        {col.label}
      </Table.Th>
    );

  return (
    <ScrollArea>
      <Table highlightOnHover verticalSpacing="xs" miw={700}>
        <Table.Thead>
          <Table.Tr>{cols.map(header)}</Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((item) => (
            <Table.Tr key={item.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/items/${item.id}`)}>
              {cols.map((col) => (
                <Table.Td key={col.key} style={{ textAlign: col.align, whiteSpace: col.wrap ? undefined : "nowrap" }}>
                  {col.render(item)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

export function CoverGrid({ items, empty = "Nothing here yet." }: { items: ItemSummary[]; empty?: ReactNode }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 5, lg: 6 }} spacing="md">
      {items.map((item) => (
        <Card key={item.id} component={Link} to={`/items/${item.id}`} padding="xs" withBorder>
          <Stack gap={6} align="center">
            <Cover name={item.name} path={imageOf(item)} width="100%" />
            <Text size="sm" fw={500} ta="center" lineClamp={2}>
              {item.name}
            </Text>
            <Group gap={4} justify="center">
              <FavoriteHeart value={item.favorite} size="sm" />
              <WorthItBadge value={item.value} />
            </Group>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}
