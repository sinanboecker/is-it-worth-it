import { Anchor, Button, Card, Group, ScrollArea, Select, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { IconEdit, IconExternalLink, IconFileImport, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useBundles } from "@/api/queries";
import type { Bundle } from "@/api/types";
import { StatusBadge, WorthItBadge } from "@/components/badges";
import { BundleImportModal } from "@/components/BundleImportModal";
import { AddBundleModal, EditBundleModal } from "@/components/Bundles";
import { Cover, Empty, Figure, imageOf, PageHeader, QueryView } from "@/components/common";
import { bundleTotals, bundleYears } from "@/lib/bundles";
import { day, euros, hours, perHour } from "@/lib/format";

function BundleCard({ bundle, onEdit }: { bundle: Bundle; onEdit: () => void }) {
  const v = bundle.value;
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
          <Table verticalSpacing={4} miw={860} layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Game</Table.Th>
                <Table.Th w={150}>Status</Table.Th>
                <Table.Th w={100} ta="right">
                  Share
                </Table.Th>
                <Table.Th w={170} ta="right">
                  Sold for
                </Table.Th>
                <Table.Th w={80} ta="right">
                  Hours
                </Table.Th>
                <Table.Th w={120} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {bundle.copies.map((c) => (
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

/** Money spent and earned, cost, hours and cost per hour of all bundles, or of the bundles bought in one year. */
function BundleTotalsCard({ bundles }: { bundles: Bundle[] }) {
  const [year, setYear] = useState("total");
  const years = bundleYears(bundles);
  const selected = year === "total" ? bundles : bundles.filter((b) => b.buy_date.startsWith(year));
  const t = bundleTotals(selected);
  return (
    <Card withBorder padding="md">
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
                <BundleCard key={b.id} bundle={b} onEdit={() => setEditing(b.id)} />
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
