import { ActionIcon, Button, Card, Group, ScrollArea, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import { createElement, useState } from "react";
import { useCameraGear } from "@/api/queries";
import type { CameraGear, CameraGearCategory } from "@/api/types";
import { CAMERA_GEAR_ICON, CameraGearModal } from "@/components/CameraModals";
import { Empty, Figure, PageHeader, QueryView } from "@/components/common";
import { compareSortKeys, SortHeader, type Sort } from "@/components/ItemList";
import { day, euros } from "@/lib/format";
import { CAMERA_GEAR_CATEGORY } from "@/lib/labels";

const CATEGORIES = Object.keys(CAMERA_GEAR_CATEGORY) as CameraGearCategory[];

/** What each column sorts by; unknown dates and prices sort before all others. */
const SORT_KEYS: Record<string, (g: CameraGear) => number | string> = {
  name: (g) => g.name,
  manufacturer: (g) => g.manufacturer ?? "",
  price: (g) => g.buy_price_cents,
  sold_for: (g) => g.sell_price_cents ?? -1,
  bought: (g) => g.buy_date ?? "",
  sold_on: (g) => g.sell_date ?? "",
  total: (g) => g.net_cost_cents,
  note: (g) => g.notes ?? "",
};

function sorted(gear: CameraGear[], sort: Sort) {
  const key = SORT_KEYS[sort.key] ?? SORT_KEYS.bought;
  return [...gear].sort((a, b) => (sort.desc ? -1 : 1) * compareSortKeys(key(a), key(b)) || compareSortKeys(a.name, b.name));
}

type Totals = { count: number; spentCents: number; earnedCents: number };

const totalsOf = (gear: CameraGear[]): Totals => ({
  count: gear.length,
  spentCents: gear.reduce((sum, g) => sum + g.buy_price_cents, 0),
  earnedCents: gear.reduce((sum, g) => sum + (g.sell_price_cents ?? 0), 0),
});

/** Money spent and earned and what's left of it, over all gear. Tinted, so it reads as a summary. */
function TotalsCard({ gear }: { gear: CameraGear[] }) {
  const t = totalsOf(gear);
  const sold = gear.filter((g) => g.sold).length;
  return (
    <Card withBorder padding="md" bg="var(--mantine-color-default-hover)">
      <Title order={4}>All camera gear</Title>
      <Text size="sm" c="dimmed" mb="sm">
        {t.count} item{t.count === 1 ? "" : "s"} · {sold} sold
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 5 }}>
        {CATEGORIES.filter((c) => c !== "other").map((c) => (
          <Figure key={c} label={CAMERA_GEAR_CATEGORY[c]} value={String(gear.filter((g) => g.category === c && !g.sold).length)} hint="owned" />
        ))}
        <Figure label="Money spent" value={euros(t.spentCents)} hint={t.earnedCents ? `earned ${euros(t.earnedCents)}` : undefined} />
        <Figure label="Total" value={euros(t.spentCents - t.earnedCents)} hint="spent minus earned" />
      </SimpleGrid>
    </Card>
  );
}

/** All gear in one table, by group (bodies, lenses, adapters, other), each with a header row; sorted within a group. */
function GearTable({
  gear,
  sort,
  onSort,
  onAdd,
  onEdit,
}: {
  gear: CameraGear[];
  sort: Sort;
  onSort: (sort: Sort) => void;
  onAdd: (category: CameraGearCategory) => void;
  onEdit: (gear: CameraGear) => void;
}) {
  const header = (label: string, key: string, w?: number, align?: "right") => (
    <SortHeader label={label} sortKey={key} sort={sort} onSort={onSort} w={w} align={align} />
  );
  return (
    <Card withBorder padding="md">
      <ScrollArea>
        <Table verticalSpacing={4} miw={1000} layout="fixed" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {header("Name", "name")}
              {header("Manufacturer", "manufacturer", 130)}
              {header("Price", "price", 100, "right")}
              {header("Sold for", "sold_for", 100, "right")}
              {header("Bought", "bought", 105)}
              {header("Sold on", "sold_on", 105)}
              {header("Total", "total", 100, "right")}
              {header("Note", "note", 180)}
              <Table.Th w={44} />
            </Table.Tr>
          </Table.Thead>
          {CATEGORIES.map((category) => {
            const group = gear.filter((g) => g.category === category);
            if (!group.length) return null;
            const t = totalsOf(group);
            return (
              <Table.Tbody key={category}>
                <Table.Tr bg="var(--mantine-color-default-hover)">
                  <Table.Td colSpan={8}>
                    <Group gap={6} wrap="nowrap">
                      {createElement(CAMERA_GEAR_ICON[category], { size: 16 })}
                      <Text size="sm" fw={700}>
                        {CAMERA_GEAR_CATEGORY[category]}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t.count} item{t.count === 1 ? "" : "s"} · total {euros(t.spentCents - t.earnedCents)}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon variant="subtle" onClick={() => onAdd(category)} aria-label={`Add to ${CAMERA_GEAR_CATEGORY[category]}`}>
                      <IconPlus size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
                {sorted(group, sort).map((g) => (
                  <Table.Tr key={g.id} opacity={g.sold ? 0.6 : 1}>
                    <Table.Td>
                      <Text size="sm" lineClamp={1}>
                        {g.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" lineClamp={1} c={g.manufacturer ? undefined : "dimmed"}>
                        {g.manufacturer ?? "–"}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">{euros(g.buy_price_cents)}</Table.Td>
                    <Table.Td ta="right">{euros(g.sell_price_cents)}</Table.Td>
                    <Table.Td>{day(g.buy_date)}</Table.Td>
                    <Table.Td>{day(g.sell_date)}</Table.Td>
                    <Table.Td ta="right" fw={600}>
                      {euros(g.net_cost_cents)}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed" lineClamp={1} title={g.notes ?? undefined}>
                        {g.notes ?? ""}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon variant="subtle" onClick={() => onEdit(g)} aria-label={`Edit ${g.name}`}>
                        <IconEdit size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            );
          })}
        </Table>
      </ScrollArea>
    </Card>
  );
}

export function CameraPage() {
  const gear = useCameraGear();
  const [dialog, setDialog] = useState<{ gear?: CameraGear; category?: CameraGearCategory } | null>(null);
  const [sort, setSort] = useLocalStorage<Sort>({
    key: "camera-gear-sort",
    defaultValue: { key: "bought", desc: true },
    getInitialValueInEffect: false,
  });
  return (
    <Stack>
      <PageHeader title="Camera">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setDialog({})}>
          Add gear
        </Button>
      </PageHeader>
      <QueryView query={gear}>
        {(data) =>
          data.length ? (
            <>
              <TotalsCard gear={data} />
              <GearTable
                gear={data}
                sort={sort}
                onSort={setSort}
                onAdd={(category) => setDialog({ category })}
                onEdit={(g) => setDialog({ gear: g })}
              />
            </>
          ) : (
            <Empty>No camera gear yet. Add bodies, lenses, adapters and more with “Add gear”.</Empty>
          )
        }
      </QueryView>
      {dialog && <CameraGearModal gear={dialog.gear} category={dialog.category} onClose={() => setDialog(null)} />}
    </Stack>
  );
}
