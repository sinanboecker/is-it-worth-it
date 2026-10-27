import {
  ActionIcon,
  Affix,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { usePcBuilds, usePcParts, usePcPurchases } from "@/api/queries";
import type { PcBuild, PcPart, PcPurchase } from "@/api/types";
import { Empty, Figure, PageHeader, QueryView } from "@/components/common";
import { PcPurchaseModal, PcSaleModal } from "@/components/PcGroupModals";
import { byCategory, PC_PART_ICON, PcBuildModal, PcPartModal } from "@/components/PcModals";
import { day, euros, hours, perDay, perHour, years } from "@/lib/format";
import { PC_PART_CATEGORY } from "@/lib/labels";

type Selection = { selected: Set<number>; onToggle: (part: PcPart) => void };

function PartsTable({
  parts,
  showBuild = false,
  showSold = true,
  dimSold = false,
  showPurchase = true,
  selection,
  onEdit,
}: {
  parts: PcPart[];
  showBuild?: boolean;
  showSold?: boolean; // parts of a build are never sold
  dimSold?: boolean; // grey out parts that have a sell price
  showPurchase?: boolean; // "from <purchase>" under the name
  selection?: Selection; // checkboxes to sell parts together
  onEdit: (part: PcPart) => void;
}) {
  // fixed columns plus at least 140 px for the part name
  const width = 914 + (showBuild ? 140 : 0) - (showSold ? 0 : 90) + (selection ? 40 : 0);
  return (
    <ScrollArea>
      <Table verticalSpacing={4} miw={width} layout="fixed" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            {selection && <Table.Th w={40} />}
            <Table.Th w={130}>Category</Table.Th>
            <Table.Th>Part</Table.Th>
            {showBuild && <Table.Th w={140}>Build</Table.Th>}
            <Table.Th w={90}>Bought</Table.Th>
            <Table.Th w={90}>Used until</Table.Th>
            <Table.Th w={90} ta="right">
              Buy price
            </Table.Th>
            {showSold && (
              <Table.Th w={90} ta="right">
                Sell price
              </Table.Th>
            )}
            <Table.Th w={60} ta="right">
              Days
            </Table.Th>
            <Table.Th w={85} ta="right">
              Years
            </Table.Th>
            <Table.Th w={95} ta="right">
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
                {selection && (
                  <Table.Td>
                    <Checkbox
                      aria-label={`Select ${p.name}`}
                      checked={selection.selected.has(p.id)}
                      onChange={() => selection.onToggle(p)}
                      disabled={p.sale_id !== null}
                      title={p.sale_id !== null ? "Sold together already" : "Select to sell together"}
                    />
                  </Table.Td>
                )}
                <Table.Td>
                  <Group gap={6} wrap="nowrap" c="dimmed">
                    <Icon size={16} />
                    <Text size="sm" style={{ whiteSpace: "nowrap" }}>
                      {PC_PART_CATEGORY[p.category]}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" lineClamp={1} title={p.notes ?? undefined}>
                    {p.name}
                  </Text>
                  {showPurchase && p.purchase_name && (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      from {p.purchase_name}
                    </Text>
                  )}
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
                {showSold && (
                  <Table.Td ta="right">
                    {p.sell_price_cents === null ? "–" : euros(p.sell_price_cents)}
                    {p.sale_id !== null && (
                      <Text size="xs" c="dimmed" lineClamp={1} title={p.sale_name ?? undefined}>
                        together
                      </Text>
                    )}
                  </Table.Td>
                )}
                <Table.Td ta="right">{p.used_days}</Table.Td>
                <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>
                  {years(p.used_years)}
                </Table.Td>
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

function PurchaseCard({ purchase, onEdit, onEditPart }: { purchase: PcPurchase; onEdit: () => void; onEditPart: (part: PcPart) => void }) {
  const profit = purchase.left_cents < 0;
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="sm">
        <div>
          <Title order={4}>{purchase.name}</Title>
          <Text size="sm" c="dimmed">
            Bought {day(purchase.buy_date)}
            {purchase.store && ` at ${purchase.store}`} · {purchase.parts.length} part{purchase.parts.length === 1 ? "" : "s"}
          </Text>
          {purchase.notes && (
            <Text size="sm" c="dimmed">
              {purchase.notes}
            </Text>
          )}
        </div>
        <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={onEdit} style={{ flexShrink: 0 }}>
          Edit
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 5 }} mb="sm">
        <Figure label="Price" value={euros(purchase.total_price_cents)} />
        <Figure
          label="Sold so far"
          value={purchase.sold_cents ? euros(purchase.sold_cents) : "–"}
          hint={`${purchase.sold_parts} of ${purchase.parts.length} parts`}
        />
        <Figure label={profit ? "Profit" : "What's left"} value={euros(Math.abs(purchase.left_cents))} hint={profit ? "sold for more than it cost" : "price minus sold so far"} />
      </SimpleGrid>
      {purchase.parts.length > 0 ? (
        <PartsTable parts={byCategory(purchase.parts)} showBuild dimSold showPurchase={false} onEdit={onEditPart} />
      ) : (
        <Text size="sm" c="dimmed">
          No parts.
        </Text>
      )}
    </Card>
  );
}

type PartDialog = { part?: PcPart; buildId?: number | null };
type View = "builds" | "purchases" | "parts";

export function PcPage() {
  const builds = usePcBuilds();
  const parts = usePcParts();
  const purchases = usePcPurchases();
  const [view, setView] = useState<View>("builds");
  const [buildDialog, setBuildDialog] = useState<{ build?: PcBuild } | null>(null);
  const [partDialog, setPartDialog] = useState<PartDialog | null>(null);
  const [purchaseDialog, setPurchaseDialog] = useState<{ purchase?: PcPurchase } | null>(null);
  const [saleDialog, setSaleDialog] = useState<{ parts?: PcPart[]; saleId?: number } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const editPart = (part: PcPart) => setPartDialog({ part });
  const selection: Selection = {
    selected,
    onToggle: (part) =>
      setSelected((s) => {
        const next = new Set(s);
        if (!next.delete(part.id)) next.add(part.id);
        return next;
      }),
  };
  const selectedParts = (parts.data ?? []).filter((p) => selected.has(p.id) && p.sale_id === null);
  return (
    <Stack>
      <PageHeader title="PC builds">
        <SegmentedControl
          data={[
            { value: "builds", label: "Builds" },
            { value: "purchases", label: "Purchases" },
            { value: "parts", label: "All parts" },
          ]}
          value={view}
          onChange={(v) => setView(v as View)}
        />
        <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setPartDialog({})}>
          Add part
        </Button>
        <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setPurchaseDialog({})}>
          Add purchase
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
                    <PartsTable parts={byCategory(loose)} dimSold selection={selection} onEdit={editPart} />
                  </Card>
                )}
              </>
            );
          }}
        </QueryView>
      ) : view === "purchases" ? (
        <QueryView query={purchases}>
          {(data) =>
            data.length ? (
              data.map((p) => (
                <PurchaseCard key={p.id} purchase={p} onEdit={() => setPurchaseDialog({ purchase: p })} onEditPart={editPart} />
              ))
            ) : (
              <Empty>No purchases yet. Bought a whole PC? Add it with “Add purchase” and list its parts.</Empty>
            )
          }
        </QueryView>
      ) : (
        <QueryView query={parts}>
          {(data) =>
            data.length ? (
              <Card withBorder padding="md">
                <PartsTable parts={data} showBuild selection={selection} onEdit={editPart} />
              </Card>
            ) : (
              <Empty>No PC parts yet. Add one with “Add part”.</Empty>
            )
          }
        </QueryView>
      )}
      {selectedParts.length > 0 && (
        <Affix position={{ bottom: 20, left: 0, right: 0 }} zIndex={150}>
          <Group justify="center" px="md">
            <Paper withBorder shadow="md" radius="md" px="md" py="xs">
              <Group gap="sm">
                <Text size="sm" fw={600}>
                  {selectedParts.length} part{selectedParts.length === 1 ? "" : "s"} selected
                </Text>
                <Button size="xs" onClick={() => setSaleDialog({ parts: selectedParts })}>
                  Sell together
                </Button>
                <Button size="xs" variant="subtle" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </Group>
            </Paper>
          </Group>
        </Affix>
      )}
      {buildDialog && <PcBuildModal build={buildDialog.build} onClose={() => setBuildDialog(null)} />}
      {partDialog && (
        <PcPartModal
          part={partDialog.part}
          buildId={partDialog.buildId}
          onClose={() => setPartDialog(null)}
          onEditSale={(saleId) => {
            setPartDialog(null);
            setSaleDialog({ saleId });
          }}
        />
      )}
      {purchaseDialog && <PcPurchaseModal purchase={purchaseDialog.purchase} onClose={() => setPurchaseDialog(null)} />}
      {saleDialog && (
        <PcSaleModal
          parts={saleDialog.parts}
          saleId={saleDialog.saleId}
          onClose={() => setSaleDialog(null)}
          onSaved={() => setSelected(new Set())}
        />
      )}
    </Stack>
  );
}
