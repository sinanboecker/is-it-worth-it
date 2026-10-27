import { ActionIcon, Anchor, Badge, Button, Card, Group, ScrollArea, SegmentedControl, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { usePcBuilds, usePcParts } from "@/api/queries";
import type { PcBuild, PcPart } from "@/api/types";
import { Empty, PageHeader, QueryView } from "@/components/common";
import { byCategory, PC_PART_ICON, PcBuildModal, PcPartModal } from "@/components/PcModals";
import { day, euros, hours, perDay, perHour, years } from "@/lib/format";
import { PC_PART_CATEGORY } from "@/lib/labels";

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text fw={600}>{value}</Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </div>
  );
}

function PartsTable({
  parts,
  showBuild = false,
  showSold = true,
  dimSold = false,
  onEdit,
}: {
  parts: PcPart[];
  showBuild?: boolean;
  showSold?: boolean; // parts of a build are never sold
  dimSold?: boolean; // grey out parts that have a sell price
  onEdit: (part: PcPart) => void;
}) {
  return (
    <ScrollArea>
      <Table verticalSpacing={4} miw={(showBuild ? 1150 : 1010) - (showSold ? 0 : 95)} layout="fixed" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={140}>Category</Table.Th>
            <Table.Th>Part</Table.Th>
            {showBuild && <Table.Th w={160}>Build</Table.Th>}
            <Table.Th w={100}>Bought</Table.Th>
            <Table.Th w={100}>Used until</Table.Th>
            <Table.Th w={95} ta="right">
              Buy price
            </Table.Th>
            {showSold && (
              <Table.Th w={95} ta="right">
                Sell price
              </Table.Th>
            )}
            <Table.Th w={70} ta="right">
              Days
            </Table.Th>
            <Table.Th w={80} ta="right">
              Years
            </Table.Th>
            <Table.Th w={100} ta="right">
              Per day
            </Table.Th>
            <Table.Th w={44} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {parts.map((p) => {
            const Icon = PC_PART_ICON[p.category];
            return (
              <Table.Tr key={p.id} opacity={dimSold && p.sell_price_cents !== null ? 0.6 : 1}>
                <Table.Td>
                  <Group gap={6} wrap="nowrap" c="dimmed">
                    <Icon size={16} />
                    <Text size="sm">{PC_PART_CATEGORY[p.category]}</Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" lineClamp={1} title={p.notes ?? undefined}>
                    {p.name}
                  </Text>
                </Table.Td>
                {showBuild && (
                  <Table.Td>
                    <Text size="sm" c={p.build_name ? undefined : "dimmed"} lineClamp={1}>
                      {p.build_name ?? "–"}
                    </Text>
                  </Table.Td>
                )}
                <Table.Td>{day(p.buy_date)}</Table.Td>
                <Table.Td>
                  {p.in_use ? (
                    <Badge size="sm" variant="light" color="green" tt="none">
                      in use
                    </Badge>
                  ) : (
                    day(p.used_until)
                  )}
                </Table.Td>
                <Table.Td ta="right">{euros(p.buy_price_cents)}</Table.Td>
                {showSold && <Table.Td ta="right">{p.sell_price_cents === null ? "–" : euros(p.sell_price_cents)}</Table.Td>}
                <Table.Td ta="right">{p.used_days}</Table.Td>
                <Table.Td ta="right">{years(p.used_years)}</Table.Td>
                <Table.Td ta="right">{perDay(p.cost_per_day_cents)}</Table.Td>
                <Table.Td>
                  <ActionIcon variant="subtle" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}>
                    <IconEdit size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

function BuildCard({
  build,
  onEdit,
  onAddPart,
  onEditPart,
}: {
  build: PcBuild;
  onEdit: () => void;
  onAddPart: () => void;
  onEditPart: (part: PcPart) => void;
}) {
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="sm">
        <div>
          <Group gap="xs">
            <Title order={4}>{build.name}</Title>
            {build.parts.length > 0 &&
              (build.in_use ? (
                <Badge variant="light" color="green" tt="none">
                  in use
                </Badge>
              ) : (
                <Badge variant="light" color="gray" tt="none">
                  used until {day(build.used_until)}
                </Badge>
              ))}
          </Group>
          <Text size="sm" c="dimmed">
            {build.first_bought_on ? `Since ${day(build.first_bought_on)}` : "No parts yet"} · {build.parts.length} part
            {build.parts.length === 1 ? "" : "s"}
            {build.hardware_id && (
              <>
                {" · "}
                <Anchor component={Link} to={`/items/${build.hardware_id}`} size="sm">
                  {build.hardware_name}
                </Anchor>
              </>
            )}
          </Text>
          {build.notes && (
            <Text size="sm" c="dimmed">
              {build.notes}
            </Text>
          )}
        </div>
        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={onAddPart}>
            Part
          </Button>
          <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={onEdit}>
            Edit
          </Button>
        </Group>
      </Group>
      {build.parts.length > 0 && (
        <SimpleGrid cols={{ base: 2, sm: 5 }} mb="sm">
          <Figure label="Bought for" value={euros(build.buy_price_cents)} />
          {build.hardware_id && <Figure label="Game hours" value={hours(build.hours)} hint={perHour(build.cost_per_hour_cents)} />}
        </SimpleGrid>
      )}
      {build.parts.length > 0 ? (
        <PartsTable parts={byCategory(build.parts)} showSold={false} onEdit={onEditPart} />
      ) : (
        <Text size="sm" c="dimmed">
          Add the parts of this build with “Part”.
        </Text>
      )}
    </Card>
  );
}

type PartDialog = { part?: PcPart; buildId?: number | null };

export function PcPage() {
  const builds = usePcBuilds();
  const parts = usePcParts();
  const [view, setView] = useState<"builds" | "parts">("builds");
  const [buildDialog, setBuildDialog] = useState<{ build?: PcBuild } | null>(null);
  const [partDialog, setPartDialog] = useState<PartDialog | null>(null);
  const editPart = (part: PcPart) => setPartDialog({ part });
  return (
    <Stack>
      <PageHeader title="PC builds">
        <SegmentedControl
          data={[
            { value: "builds", label: "Builds" },
            { value: "parts", label: "All parts" },
          ]}
          value={view}
          onChange={(v) => setView(v as "builds" | "parts")}
        />
        <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setPartDialog({})}>
          Add part
        </Button>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setBuildDialog({})}>
          New build
        </Button>
      </PageHeader>
      {view === "builds" ? (
        <QueryView query={builds}>
          {(data) => {
            const loose = (parts.data ?? []).filter((p) => p.build_id === null);
            if (!data.length && !loose.length) {
              return <Empty>No PC builds yet. Create one with “New build”, then add its parts.</Empty>;
            }
            return (
              <>
                {data.map((b) => (
                  <BuildCard
                    key={b.id}
                    build={b}
                    onEdit={() => setBuildDialog({ build: b })}
                    onAddPart={() => setPartDialog({ buildId: b.id })}
                    onEditPart={editPart}
                  />
                ))}
                {loose.length > 0 && (
                  <Card withBorder padding="md">
                    <Title order={4} mb="sm">
                      Parts without a build
                    </Title>
                    <PartsTable parts={byCategory(loose)} dimSold onEdit={editPart} />
                  </Card>
                )}
              </>
            );
          }}
        </QueryView>
      ) : (
        <QueryView query={parts}>
          {(data) =>
            data.length ? (
              <Card withBorder padding="md">
                <PartsTable parts={data} showBuild onEdit={editPart} />
              </Card>
            ) : (
              <Empty>No PC parts yet. Add one with “Add part”.</Empty>
            )
          }
        </QueryView>
      )}
      {buildDialog && <PcBuildModal build={buildDialog.build} onClose={() => setBuildDialog(null)} />}
      {partDialog && <PcPartModal part={partDialog.part} buildId={partDialog.buildId} onClose={() => setPartDialog(null)} />}
    </Stack>
  );
}
