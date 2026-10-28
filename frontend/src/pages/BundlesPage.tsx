import { Anchor, Button, Card, Group, ScrollArea, Select, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { IconEdit, IconExternalLink, IconFileImport, IconPlus } from "@tabler/icons-react";
import { useLocalStorage } from "@mantine/hooks";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useBundles } from "@/api/queries";
import type { Bundle } from "@/api/types";
import { StatusBadge, WorthItBadge } from "@/components/badges";
import { BundleImportModal } from "@/components/BundleImportModal";
import { AddBundleModal, EditBundleModal } from "@/components/Bundles";
import { Cover, Empty, Figure, imageOf, PageHeader, QueryView } from "@/components/common";
import { compareSortKeys, SortHeader, type Sort } from "@/components/ItemList";
import { bundleTotals, bundleYears } from "@/lib/bundles";
import { day, euros, hours, perHour } from "@/lib/format";
import { STATUS } from "@/lib/labels";

type BundleGame = Bundle["copies"][number];

/** Sort keys of the games table; null values (not sold, no hours) go last. */
const GAME_SORT: Record<string, (c: BundleGame) => number | string> = {
  name: (c) => c.item_name,
  status: (c) => (c.status ? STATUS[c.status].label : ""),
  share: (c) => c.buy_price_cents,
  sold: (c) => c.sell_price_cents ?? Number.MAX_SAFE_INTEGER,
  hours: (c) => c.value?.hours ?? -1,
  worth: (c) => (c.value?.worth_it ? 0 : (c.value?.hours_to_break_even ?? 1e9)),
};

const sortGames = (copies: BundleGame[], sort: Sort) => {
  const key = GAME_SORT[sort.key] ?? GAME_SORT.name;
  return [...copies].sort((a, b) => (sort.desc ? -1 : 1) * compareSortKeys(key(a), key(b)));
};

/** How the games of all bundles are sorted: by name until another column is picked (remembered in the browser). */
function useGameSort() {
  return useLocalStorage<Sort>({ key: "bundle-games-sort", defaultValue: { key: "name", desc: false }, getInitialValueInEffect: false });
}

function BundleCard({ bundle, onEdit, sort, onSort }: { bundle: Bundle; onEdit: () => void; sort: Sort; onSort: (sort: Sort) => void }) {
  const v = bundle.value;
  const header = (label: string, key: string, w?: number, align?: "right") => (
    <SortHeader label={label} sortKey={key} sort={sort} onSort={onSort} w={w} align={align} />
  );
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="sm">
        <div>
          <Group gap="xs">
            <Title order={4}>{bundle.name}</Title>
            {bundle.url && (
              <Anchor href={bundle.url} target="_blank" rel="noreferrer" aria-label={`Open the link of ${bundle.name}`} display="flex">
                <IconExternalLink size={18} />
              </Anchor>
            )}
            <WorthItBadge value={v} />
          </Group>
          <Text size="sm" c="dimmed">
            Bought {day(bundle.buy_date)}
            {bundle.store && ` at ${bundle.store}`} · {bundle.copies.length} game{bundle.copies.length === 1 ? "" : "s"}
          </Text>
        </div>
        <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={onEdit} style={{ flexShrink: 0 }}>
          Edit
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 5 }} mb="sm">
        <Figure label="Bought for" value={euros(bundle.total_price_cents)} />
        <Figure
          label="Sold for"
          value={bundle.sold_cents ? euros(bundle.sold_cents) : "–"}
          hint={bundle.other_sales_cents ? `incl. ${euros(bundle.other_sales_cents)} not listed below` : undefined}
        />
        <Figure label="Net cost" value={euros(v.net_cost_cents)} />
        <Figure label="Hours" value={hours(v.hours)} />
        <Figure label="Cost per hour" value={perHour(v.cost_per_hour_cents)} />
      </SimpleGrid>
      {bundle.copies.length === 0 ? (
        <Text size="sm" c="dimmed">
          No games listed.
        </Text>
      ) : (
        <ScrollArea>
          <Table verticalSpacing={4} miw={870} layout="fixed">
            <Table.Thead>
              <Table.Tr>
                {header("Game", "name")}
                {header("Status", "status", 150)}
                {header("Share", "share", 100, "right")}
                {header("Sold for", "sold", 170, "right")}
                {header("Hours", "hours", 80, "right")}
                {header("Worth it?", "worth", 130, "right")}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortGames(bundle.copies, sort).map((c) => (
                <Table.Tr key={c.copy_id}>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Cover name={c.item_name} path={imageOf(c)} width={40} />
                      <Anchor component={Link} to={`/items/${c.item_id}`} size="sm" lineClamp={1}>
                        {c.item_name}
                      </Anchor>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge status={c.status} />
                  </Table.Td>
                  <Table.Td ta="right">{euros(c.buy_price_cents)}</Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>
                    {c.sell_price_cents === null ? "–" : `${euros(c.sell_price_cents)} · ${day(c.sell_date)}`}
                  </Table.Td>
                  <Table.Td ta="right">{hours(c.value?.hours)}</Table.Td>
                  <Table.Td ta="right">
                    <WorthItBadge value={c.value} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Card>
  );
}

/** Money spent and earned, cost, hours and cost per hour of all bundles, or of the bundles bought in one year.
 * Tinted, so it reads as a summary and not as one more bundle. */
function BundleTotalsCard({ bundles }: { bundles: Bundle[] }) {
  const [year, setYear] = useState("total");
  const years = bundleYears(bundles);
  const selected = year === "total" ? bundles : bundles.filter((b) => b.buy_date.startsWith(year));
  const t = bundleTotals(selected);
  return (
    <Card withBorder padding="md" bg="var(--mantine-color-default-hover)" mb="sm">
      <Group justify="space-between" align="flex-start" mb="sm">
        <div>
          <Title order={4}>{year === "total" ? "All bundles" : `Bundles bought in ${year}`}</Title>
          <Text size="sm" c="dimmed">
            {t.count} bundle{t.count === 1 ? "" : "s"}
          </Text>
        </div>
        <Select
          aria-label="Year"
          w={120}
          data={[{ value: "total", label: "Total" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
          value={year}
          onChange={(v) => setYear(v ?? "total")}
          allowDeselect={false}
        />
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 5 }}>
        <Figure label="Money spent" value={euros(t.spentCents)} />
        <Figure label="Money earned" value={t.earnedCents ? euros(t.earnedCents) : "–"} hint="games and keys sold" />
        <Figure label="Total cost" value={euros(t.costCents)} hint="spent minus earned" />
        <Figure label="Hours" value={hours(t.hours)} />
        <Figure label="Cost per hour" value={perHour(t.costPerHourCents)} />
      </SimpleGrid>
    </Card>
  );
}

export function BundlesPage() {
  const bundles = useBundles();
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [gameSort, setGameSort] = useGameSort();
  return (
    <Stack>
      <PageHeader title="Bundles">
        <Button variant="default" leftSection={<IconFileImport size={16} />} onClick={() => setImporting(true)}>
          Import
        </Button>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAdding(true)}>
          Add bundle
        </Button>
      </PageHeader>
      <QueryView query={bundles}>
        {(data) => {
          // game bundles only; bundles with hardware (console + game) are left out
          const games = data.filter((b) => b.copies.every((c) => c.kind === "game"));
          return games.length ? (
            <>
              <BundleTotalsCard bundles={games} />
              {games.map((b) => (
                <BundleCard key={b.id} bundle={b} onEdit={() => setEditing(b.id)} sort={gameSort} onSort={setGameSort} />
              ))}
            </>
          ) : (
            <Empty>No game bundles yet. Add one with “Add bundle”.</Empty>
          );
        }}
      </QueryView>
      {adding && <AddBundleModal onClose={() => setAdding(false)} />}
      {importing && <BundleImportModal onClose={() => setImporting(false)} />}
      {editing !== null && <EditBundleModal bundleId={editing} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
