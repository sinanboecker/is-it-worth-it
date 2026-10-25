import { BarChart, ScatterChart } from "@mantine/charts";
import { Anchor, Card, ScrollArea, Select, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  useCategories,
  useCategoryTotals,
  useDlcStats,
  useFormatStats,
  useHardwareStats,
  useRatingStats,
  useResaleStats,
  useStoreStats,
  useYearly,
} from "@/api/queries";
import { Empty, PageHeader, QueryView } from "@/components/common";
import { euros, hours, perHour, percent } from "@/lib/format";
import { FORMAT } from "@/lib/labels";

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <Card withBorder padding="md">
      <Title order={4}>{title}</Title>
      {hint && (
        <Text size="xs" c="dimmed" mb="sm">
          {hint}
        </Text>
      )}
      <div style={{ marginTop: hint ? 0 : 12 }}>{children}</div>
    </Card>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <Empty>No data yet.</Empty>;
  return (
    <ScrollArea>
      <Table striped verticalSpacing={6} miw={head.length * 90}>
        <Table.Thead>
          <Table.Tr>
            {head.map((h, i) => (
              <Table.Th key={h} ta={i ? "right" : undefined}>
                {h}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((cells, r) => (
            <Table.Tr key={r}>
              {cells.map((cell, i) => (
                <Table.Td key={i} ta={i ? "right" : undefined}>
                  {cell}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

export function StatsPage() {
  const categories = useCategories();
  const [category, setCategory] = useState<number | undefined>(undefined);
  const yearly = useYearly(category);
  const totals = useCategoryTotals();
  const stores = useStoreStats(category);
  const formats = useFormatStats(category);
  const resale = useResaleStats(category);
  const ratings = useRatingStats(category);
  const dlc = useDlcStats(category);
  const hardware = useHardwareStats();

  return (
    <Stack>
      <PageHeader title="Stats">
        <Select
          placeholder="All categories"
          w={220}
          data={(categories.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
          value={category ? String(category) : null}
          onChange={(v) => setCategory(v ? Number(v) : undefined)}
          clearable
        />
      </PageHeader>

      <Section title="Per year" hint="Games and DLC only, everything counted in the year it was bought (sell prices too).">
        <QueryView query={yearly}>
          {(rows) => (
            <SimpleTable
              head={["Year", "Spent", "of which DLC", "Games bought", "Hours", "€/h", "Finished", "Ø rating", "Worth it", "Abandoned"]}
              rows={[...rows].reverse().map((r) => [
                <b key="y">{r.year}</b>,
                euros(r.spent_cents),
                euros(r.dlc_spent_cents),
                r.games_bought,
                hours(r.hours),
                perHour(r.cost_per_hour_cents),
                r.games_finished,
                r.average_rating?.toLocaleString("de-DE") ?? "–",
                percent(r.worth_it_rate),
                r.abandoned_count ? `${r.abandoned_count} (${euros(r.abandoned_cost_cents)})` : "–",
              ])}
            />
          )}
        </QueryView>
      </Section>

      {!category && (
        <Section title="Categories" hint="Lifetime totals including hardware.">
          <QueryView query={totals}>
            {(rows) => (
              <SimpleTable
                head={["Category", "Total", "Games", "DLC", "Hardware", "Hours", "All-in €/h", "Games €/h", "Worth it"]}
                rows={rows.map((r) => [
                  <Anchor key="n" component={Link} to={`/categories/${r.category_id}`}>
                    {r.name}
                  </Anchor>,
                  <b key="t">{euros(r.totals.total_cost_cents)}</b>,
                  euros(r.totals.games_cost_cents),
                  euros(r.totals.dlc_cost_cents),
                  euros(r.totals.hardware_cost_cents),
                  hours(r.totals.hours),
                  perHour(r.totals.all_in_cost_per_hour_cents),
                  perHour(r.totals.games_cost_per_hour_cents),
                  percent(r.totals.worth_it_rate),
                ])}
              />
            )}
          </QueryView>
        </Section>
      )}

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Section title="Stores" hint="Lifetime incl. hardware.">
          <QueryView query={stores}>
            {(rows) => (
              <SimpleTable
                head={["Store", "Spent", "Copies", "DLC"]}
                rows={rows.map((r) => [r.store, euros(r.spent_cents), r.copies, r.dlcs])}
              />
            )}
          </QueryView>
        </Section>

        <Section title="Physical vs digital" hint="Game copies. Physical copies can be resold.">
          <QueryView query={formats}>
            {(rows) => (
              <SimpleTable
                head={["Format", "Copies", "Share", "Spent", "Back from sales", "Ø net cost"]}
                rows={rows.map((r) => [
                  FORMAT[r.format as keyof typeof FORMAT],
                  r.copies,
                  percent(r.share),
                  euros(r.spent_cents),
                  euros(r.received_cents),
                  euros(r.average_net_cost_cents),
                ])}
              />
            )}
          </QueryView>
        </Section>

        <Section title="Resale" hint="Sold copies: how much of the buy price came back.">
          <QueryView query={resale}>
            {(rows) => (
              <SimpleTable
                head={["Group", "Sold", "Bought for", "Sold for", "Back"]}
                rows={rows.map((r) => [r.group, r.sold_copies, euros(r.bought_cents), euros(r.received_cents), percent(r.resale_rate)])}
              />
            )}
          </QueryView>
        </Section>

        <Section title="DLC">
          <QueryView query={dlc}>
            {(d) =>
              d.count ? (
                <Stack gap="xs">
                  <Text size="sm">
                    {d.count} DLC · {euros(d.total_cents)}
                  </Text>
                  <SimpleTable
                    head={["Game", "DLC", "Spent"]}
                    rows={d.top_games.map((g) => [
                      <Anchor key="g" component={Link} to={`/items/${g.item_id}`}>
                        {g.name}
                      </Anchor>,
                      g.dlc_count,
                      euros(g.dlc_cost_cents),
                    ])}
                  />
                </Stack>
              ) : (
                <Empty>No DLC yet.</Empty>
              )
            }
          </QueryView>
        </Section>

        <Section title="Ratings">
          <QueryView query={ratings}>
            {(r) =>
              r.rated_games ? (
                <Stack>
                  <Text size="sm">
                    {r.rated_games} rated games · Ø {r.average_rating?.toLocaleString("de-DE")} ★
                  </Text>
                  <BarChart
                    h={200}
                    dataKey="stars"
                    data={Object.entries(r.distribution).map(([stars, count]) => ({ stars: stars.replace(".", ","), Games: count }))}
                    series={[{ name: "Games", color: "yellow.6" }]}
                  />
                </Stack>
              ) : (
                <Empty>No rated games yet.</Empty>
              )
            }
          </QueryView>
        </Section>

        <Section title="Value vs fun" hint="Rating vs cost per hour: top left = cheap and great.">
          <QueryView query={ratings}>
            {(r) =>
              r.value_vs_fun.length ? (
                <ScatterChart
                  h={240}
                  dataKey={{ x: "€/h", y: "Rating" }}
                  data={[
                    {
                      color: "indigo.6",
                      name: "Games",
                      data: r.value_vs_fun.map((p) => ({ "€/h": p.cost_per_hour_cents / 100, Rating: p.rating })),
                    },
                  ]}
                  valueFormatter={{ x: (v) => `${v.toLocaleString("de-DE")} €/h`, y: (v) => `${v} ★` }}
                  yAxisProps={{ domain: [0, 5], ticks: [0, 1, 2, 3, 4, 5] }}
                />
              ) : (
                <Empty>Rate games with playtime to see this chart.</Empty>
              )
            }
          </QueryView>
        </Section>
      </SimpleGrid>

      <Section title="Hardware" hint="Hours = hours of all games played on the device.">
        <QueryView query={hardware}>
          {(rows) => (
            <SimpleTable
              head={["Device", "Net cost", "Hours", "€/h", "Games", "Emulated", "Worth it"]}
              rows={rows.map((d) => [
                <Anchor key="d" component={Link} to={`/items/${d.id}`}>
                  {d.name}
                </Anchor>,
                euros(d.value?.net_cost_cents),
                hours(d.value?.hours),
                perHour(d.value?.cost_per_hour_cents),
                d.value?.games_played_on ?? 0,
                d.value?.emulated_games ?? 0,
                d.value?.worth_it ? "✔" : `${hours(d.value?.hours_to_break_even)} left`,
              ])}
            />
          )}
        </QueryView>
      </Section>
    </Stack>
  );
}
