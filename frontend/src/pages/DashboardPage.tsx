import { BarChart, LineChart } from "@mantine/charts";
import { Anchor, Card, Group, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCategoryTotals, useNowPlaying, useSummary, useTop, useYearly } from "@/api/queries";
import type { ItemSummary } from "@/api/types";
import { Cover, Empty, imageOf, PageHeader, QueryView, StatTile } from "@/components/common";
import { euros, hours, perHour, percent } from "@/lib/format";
import { STATUS } from "@/lib/labels";

const eurosFromCents = (cents: number | null | undefined) => (cents ?? 0) / 100;
const euroAxis = (v: number) => `${Math.round(v).toLocaleString("de-DE")} €`;

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card withBorder padding="md">
      <Title order={5} mb="sm">
        {title}
      </Title>
      {children}
    </Card>
  );
}

function ItemListCard({ title, items, render }: { title: string; items: ItemSummary[]; render: (i: ItemSummary) => ReactNode }) {
  return (
    <Card withBorder padding="md">
      <Title order={5} mb="sm">
        {title}
      </Title>
      {items.length ? (
        <Table verticalSpacing={4}>
          <Table.Tbody>
            {items.map((i) => (
              <Table.Tr key={i.id}>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Cover name={i.name} path={imageOf(i)} width={40} />
                    <Anchor component={Link} to={`/items/${i.id}`} size="sm" lineClamp={1}>
                      {i.name}
                    </Anchor>
                  </Group>
                </Table.Td>
                <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>
                  <Text size="sm">{render(i)}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Empty>Nothing yet.</Empty>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const summary = useSummary();
  const categories = useCategoryTotals();
  const yearly = useYearly();
  const nowPlaying = useNowPlaying();
  const best = useTop({ metric: "cost_per_hour", order: "asc", limit: 5 });
  const worst = useTop({ metric: "cost_per_hour", order: "desc", limit: 5 });
  const almost = useTop({ metric: "hours_to_break_even", order: "asc", limit: 5 });

  return (
    <Stack>
      <PageHeader title="Dashboard" />
      <QueryView query={summary}>
        {(t) => (
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
            <StatTile label="Total spent" value={euros(t.total_cost_cents)} hint={`incl. ${euros(t.hardware_cost_cents)} hardware`} />
            <StatTile label="Hours played" value={hours(t.hours)} />
            <StatTile label="All-in €/h" value={perHour(t.all_in_cost_per_hour_cents)} hint={`games only ${perHour(t.games_cost_per_hour_cents)}`} />
            <StatTile label="Games" value={t.games_count} hint={`worth it: ${percent(t.worth_it_rate)}`} />
            <StatTile
              label="Backlog"
              value={t.status_counts.backlog ?? 0}
              hint={`${euros(t.backlog_value_cents)} not played yet`}
            />
            <Anchor component={Link} to="/now-playing" underline="never">
              <StatTile label="Now playing" value={nowPlaying.data?.playing.length ?? "–"} hint={`${nowPlaying.data?.on_hold.length ?? 0} on hold`} />
            </Anchor>
          </SimpleGrid>
        )}
      </QueryView>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <ChartCard title="Cost per category">
          <QueryView query={categories}>
            {(rows) => (
              <BarChart
                h={260}
                type="stacked"
                withLegend
                dataKey="name"
                valueFormatter={euroAxis}
                data={rows
                  .filter((r) => r.totals.total_cost_cents)
                  .map((r) => ({
                    name: r.name,
                    Games: eurosFromCents(r.totals.games_cost_cents - r.totals.dlc_cost_cents),
                    DLC: eurosFromCents(r.totals.dlc_cost_cents),
                    Hardware: eurosFromCents(r.totals.hardware_cost_cents),
                  }))}
                series={[
                  { name: "Games", color: "indigo.6" },
                  { name: "DLC", color: "grape.5" },
                  { name: "Hardware", color: "gray.5" },
                ]}
              />
            )}
          </QueryView>
        </ChartCard>
        <ChartCard title="Game spending per year (incl. DLC)">
          <QueryView query={yearly}>
            {(rows) => (
              <BarChart
                h={260}
                dataKey="year"
                valueFormatter={euroAxis}
                data={rows.map((r) => ({ year: String(r.year), Spent: eurosFromCents(r.spent_cents) }))}
                series={[{ name: "Spent", color: "indigo.6" }]}
              />
            )}
          </QueryView>
        </ChartCard>
        <ChartCard title="Hours per year (by buy year)">
          <QueryView query={yearly}>
            {(rows) => (
              <BarChart
                h={240}
                dataKey="year"
                valueFormatter={(v) => `${v.toLocaleString("de-DE")} h`}
                data={rows.map((r) => ({ year: String(r.year), Hours: r.hours }))}
                series={[{ name: "Hours", color: "teal.6" }]}
              />
            )}
          </QueryView>
        </ChartCard>
        <ChartCard title="Cost per hour & games finished per year">
          <QueryView query={yearly}>
            {(rows) => (
              <LineChart
                h={240}
                dataKey="year"
                curveType="linear"
                withLegend
                withRightYAxis
                data={rows.map((r) => ({
                  year: String(r.year),
                  "€/h": eurosFromCents(r.cost_per_hour_cents),
                  Finished: r.games_finished,
                }))}
                series={[
                  { name: "€/h", color: "orange.6" },
                  { name: "Finished", color: "green.6", yAxisId: "right" },
                ]}
              />
            )}
          </QueryView>
        </ChartCard>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <QueryView query={almost}>
          {(items) => (
            <ItemListCard title="Almost worth it" items={items} render={(i) => `${hours(i.value?.hours_to_break_even)} left`} />
          )}
        </QueryView>
        <QueryView query={best}>
          {(items) => <ItemListCard title="Best value" items={items} render={(i) => perHour(i.value?.cost_per_hour_cents)} />}
        </QueryView>
        <QueryView query={worst}>
          {(items) => <ItemListCard title="Worst value" items={items} render={(i) => perHour(i.value?.cost_per_hour_cents)} />}
        </QueryView>
      </SimpleGrid>

      <QueryView query={summary}>
        {(t) => (
          <Card withBorder padding="md">
            <Title order={5} mb="sm">
              Games by status
            </Title>
            <Group gap="lg">
              {Object.entries(t.status_counts).map(([status, count]) => (
                <Text key={status} size="sm">
                  {STATUS[status as keyof typeof STATUS]?.label ?? status}: <b>{count}</b>
                </Text>
              ))}
            </Group>
          </Card>
        )}
      </QueryView>
    </Stack>
  );
}
