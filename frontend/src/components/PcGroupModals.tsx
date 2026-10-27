/** PC parts bought together (a purchase, e.g. a whole PC) and sold together (a sale): one price split across parts. */
import { ActionIcon, Alert, Button, Card, Grid, Group, Modal, Select, Stack, Table, Text, Textarea, TextInput } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { api, unwrap } from "@/api/client";
import { useApiMutation, usePcBuilds, usePcSale } from "@/api/queries";
import type { PcPart, PcPartCategory, PcPurchase, PcSale, SplitMode } from "@/api/types";
import { euros, todayIso } from "@/lib/format";
import { useSplitPreview } from "./Bundles";
import { DateField, MoneyInput, StoreInput } from "./inputs";
import { confirmDelete, PartCategorySelect } from "./PcModals";

const PURCHASE_SPLIT: Record<SplitMode, string> = {
  equal: "Equal shares",
  proportional: "Proportional to the parts' values",
  manual: "Manual",
};

const SALE_SPLIT: Record<SplitMode, string> = {
  proportional: "Proportional to the buy prices",
  equal: "Equal shares",
  manual: "Manual",
};

const splitOptions = (labels: Record<SplitMode, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

// --- bought together --------------------------------------------------------------------------

type PurchaseRow = {
  key: number;
  id: number | null; // existing part
  name: string;
  category: PcPartCategory | null;
  value: number | null; // proportional split
  share: number | null; // manual split
  build: number | null;
  sold: boolean;
};

let nextKey = 1;
const emptyRow = (category: PcPartCategory | null = null): PurchaseRow => ({
  key: nextKey++,
  id: null,
  name: "",
  category,
  value: null,
  share: null,
  build: null,
  sold: false,
});

/** New or edit a purchase: name, date, store, price and split on top, then its parts one by one. */
export function PcPurchaseModal({ purchase, onClose }: { purchase?: PcPurchase; onClose: () => void }) {
  const builds = usePcBuilds();
  const [name, setName] = useState(purchase?.name ?? "");
  const [buyDate, setBuyDate] = useState<string | null>(purchase?.buy_date ?? todayIso());
  const [store, setStore] = useState<string | null>(purchase?.store ?? null);
  const [total, setTotal] = useState<number | null>(purchase?.total_price_cents ?? null);
  const [mode, setMode] = useState<SplitMode>(purchase?.split_mode ?? "equal");
  const [notes, setNotes] = useState(purchase?.notes ?? "");
  const [rows, setRows] = useState<PurchaseRow[]>(
    purchase
      ? purchase.parts.map((p) => ({
          key: nextKey++,
          id: p.id,
          name: p.name,
          category: p.category,
          value: p.value_cents,
          share: p.buy_price_cents,
          build: p.build_id,
          sold: p.sell_price_cents !== null,
        }))
      : [emptyRow()],
  );
  const update = (key: number, patch: Partial<PurchaseRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const preview = useSplitPreview(
    total,
    mode,
    rows.map((r) => r.value),
    rows.map((r) => r.share),
  );
  const save = useApiMutation(
    () => {
      const body = {
        name: name.trim(),
        buy_date: buyDate!,
        total_price_cents: total!,
        store,
        split_mode: mode,
        notes: notes.trim() || null,
        parts: rows.map((r) => ({
          id: r.id,
          name: r.name.trim(),
          category: r.category!,
          value_cents: r.value,
          buy_price_cents: mode === "manual" ? r.share : null,
          build_id: r.sold ? null : r.build,
          notes: null,
        })),
      };
      return purchase
        ? unwrap(api.PUT("/api/v1/pc/purchases/{purchase_id}", { params: { path: { purchase_id: purchase.id } }, body }))
        : unwrap(api.POST("/api/v1/pc/purchases", { body }));
    },
    { success: (p) => `Purchase “${p.name}” saved`, onSuccess: onClose },
  );
  const remove = useApiMutation(
    () => unwrap(api.DELETE("/api/v1/pc/purchases/{purchase_id}", { params: { path: { purchase_id: purchase!.id } } })),
    { success: "Purchase deleted", onSuccess: onClose },
  );
  const complete =
    name.trim() && buyDate && total !== null && rows.every((r) => r.name.trim() && r.category) && (!rows.length || preview.isSuccess);
  const buildOptions = (builds.data ?? []).map((b) => ({ value: String(b.id), label: b.name }));

  return (
    <Modal opened onClose={onClose} title={purchase ? `Edit ${purchase.name}` : "New PC purchase"} size="xl">
      <Stack>
        <Text size="sm" c="dimmed">
          Parts bought together, e.g. a whole PC: the price is split across the parts. They can then go into builds or be
          sold on their own.
        </Text>
        <TextInput label="Name" placeholder="e.g. Used gaming PC" value={name} onChange={(e) => setName(e.currentTarget.value)} required data-autofocus />
        <Group grow align="flex-start">
          <DateField label="Bought on" value={buyDate} onChange={setBuyDate} required />
          <StoreInput value={store} onChange={setStore} />
        </Group>
        <Group grow align="flex-start">
          <MoneyInput label="Price" value={total} onChange={setTotal} required />
          <Select label="Split the price" data={splitOptions(PURCHASE_SPLIT)} value={mode} onChange={(v) => v && setMode(v as SplitMode)} allowDeselect={false} />
        </Group>
        <Text size="sm" fw={600} mt="xs">
          Parts
        </Text>
        {rows.map((row, index) => (
          <Card key={row.key} withBorder padding="sm">
            <Grid align="flex-end" gutter="sm">
              <Grid.Col span={{ base: 12, sm: mode === "equal" ? 4 : 3 }}>
                <TextInput label="Part" placeholder="e.g. RTX 3070" value={row.name} onChange={(e) => update(row.key, { name: e.currentTarget.value })} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <PartCategorySelect value={row.category} onChange={(category) => update(row.key, { category })} />
              </Grid.Col>
              {mode !== "equal" && (
                <Grid.Col span={{ base: 6, sm: 2 }}>
                  {mode === "proportional" ? (
                    <MoneyInput label="Value" placeholder="worth alone" value={row.value} onChange={(value) => update(row.key, { value })} />
                  ) : (
                    <MoneyInput label="Share" value={row.share} onChange={(share) => update(row.key, { share })} />
                  )}
                </Grid.Col>
              )}
              <Grid.Col span={{ base: 6, sm: mode === "equal" ? 3 : 2 }}>
                <Select
                  label="Build"
                  placeholder={row.sold ? "Sold" : "No build"}
                  data={buildOptions}
                  value={row.build && !row.sold ? String(row.build) : null}
                  onChange={(v) => update(row.key, { build: v ? Number(v) : null })}
                  disabled={row.sold}
                  clearable
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 2 }}>
                <Group gap="xs" justify="flex-end" wrap="nowrap" mb={4}>
                  <Text size="sm" fw={600} ta="right">
                    {preview.data ? euros(preview.data.shares_cents[index]) : ""}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                    aria-label={`Remove ${row.name || "part"}`}
                    title={row.id ? "Take out of the purchase (the part stays)" : "Remove"}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Grid.Col>
            </Grid>
          </Card>
        ))}
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setRows((rs) => [...rs, emptyRow(null)])}>
          Add part
        </Button>
        {preview.isError && (
          <Text c="red" size="sm">
            {preview.error.message}
          </Text>
        )}
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} autosize minRows={2} />
        <Group justify={purchase ? "space-between" : "flex-end"}>
          {purchase && (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() =>
                confirmDelete(`Delete ${purchase.name}?`, "Its parts stay, with the price they have now.", () => remove.mutate(undefined))
              }
            >
              Delete purchase
            </Button>
          )}
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!complete}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// --- sold together ----------------------------------------------------------------------------

/** Sell parts together (from a selection), or edit / delete a sale. */
export function PcSaleModal({
  parts,
  saleId,
  onClose,
  onSaved,
}: {
  parts?: PcPart[];
  saleId?: number;
  onClose: () => void;
  onSaved?: () => void;
}) {
  if (saleId !== undefined) return <EditSale saleId={saleId} onClose={onClose} />;
  return <SaleForm parts={parts ?? []} onClose={onClose} onSaved={onSaved} />;
}

function EditSale({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const sale = usePcSale(saleId);
  if (sale.isError)
    return (
      <Modal opened onClose={onClose} title="Sale">
        <Alert color="red">{sale.error.message}</Alert>
      </Modal>
    );
  return sale.data ? <SaleForm sale={sale.data} parts={sale.data.parts} onClose={onClose} /> : null;
}

function SaleForm({ sale, parts, onClose, onSaved }: { sale?: PcSale; parts: PcPart[]; onClose: () => void; onSaved?: () => void }) {
  const [name, setName] = useState(sale?.name ?? "");
  const [sellDate, setSellDate] = useState<string | null>(sale?.sell_date ?? todayIso());
  const [total, setTotal] = useState<number | null>(sale?.total_price_cents ?? null);
  const [mode, setMode] = useState<SplitMode>(sale?.split_mode ?? "proportional");
  const [notes, setNotes] = useState(sale?.notes ?? "");
  const [rows, setRows] = useState(parts.map((part) => ({ part, share: part.sell_price_cents })));
  // like the server: bought for 0 € in total → equal shares instead of proportional
  const weights = rows.map((r) => r.part.buy_price_cents);
  const effectiveMode = mode === "proportional" && !weights.some(Boolean) ? "equal" : mode;
  const preview = useSplitPreview(
    total,
    effectiveMode,
    weights,
    rows.map((r) => r.share),
  );
  const save = useApiMutation(
    () => {
      const body = {
        name: name.trim() || null,
        sell_date: sellDate!,
        total_price_cents: total!,
        split_mode: mode,
        notes: notes.trim() || null,
        parts: rows.map((r) => ({ id: r.part.id, sell_price_cents: mode === "manual" ? r.share : null })),
      };
      return sale
        ? unwrap(api.PUT("/api/v1/pc/sales/{sale_id}", { params: { path: { sale_id: sale.id } }, body }))
        : unwrap(api.POST("/api/v1/pc/sales", { body }));
    },
    {
      success: (s) => `Sold ${s.parts.length} part${s.parts.length === 1 ? "" : "s"} together`,
      onSuccess: () => {
        onSaved?.();
        onClose();
      },
    },
  );
  const remove = useApiMutation(() => unwrap(api.DELETE("/api/v1/pc/sales/{sale_id}", { params: { path: { sale_id: sale!.id } } })), {
    success: "Sale deleted: its parts aren't sold any more",
    onSuccess: onClose,
  });
  const earlyPart = rows.find((r) => sellDate && sellDate < r.part.buy_date);

  return (
    <Modal opened onClose={onClose} title={sale ? "Edit sale" : `Sell ${rows.length} parts together`} size="lg">
      <Stack>
        <Group grow align="flex-start">
          <TextInput label="Name" placeholder="optional, e.g. Kleinanzeigen bundle" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
          <DateField label="Sold on" value={sellDate} onChange={setSellDate} required error={earlyPart ? `${earlyPart.part.name} was bought later` : null} />
        </Group>
        <Group grow align="flex-start">
          <MoneyInput label="Sold for" value={total} onChange={setTotal} required />
          <Select label="Split the price" data={splitOptions(SALE_SPLIT)} value={mode} onChange={(v) => v && setMode(v as SplitMode)} allowDeselect={false} />
        </Group>
        <Table verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Part</Table.Th>
              <Table.Th ta="right">Bought for</Table.Th>
              {mode === "manual" && <Table.Th>Share</Table.Th>}
              <Table.Th ta="right">Sold for</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row, index) => (
              <Table.Tr key={row.part.id}>
                <Table.Td>{row.part.name}</Table.Td>
                <Table.Td ta="right">{euros(row.part.buy_price_cents)}</Table.Td>
                {mode === "manual" && (
                  <Table.Td w={140}>
                    <MoneyInput
                      size="xs"
                      aria-label={`Share of ${row.part.name}`}
                      value={row.share}
                      onChange={(share) => setRows((rs) => rs.map((r, i) => (i === index ? { ...r, share } : r)))}
                    />
                  </Table.Td>
                )}
                <Table.Td ta="right" fw={600}>
                  {preview.data ? euros(preview.data.shares_cents[index]) : ""}
                </Table.Td>
                <Table.Td>
                  {rows.length > 1 && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => setRows((rs) => rs.filter((r) => r.part.id !== row.part.id))}
                      aria-label={`Not sold: ${row.part.name}`}
                      title="Not part of this sale"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {preview.isError && (
          <Text c="red" size="sm">
            {preview.error.message}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          The parts leave their builds and are used until the sale date (unless they were retired before).
        </Text>
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} autosize minRows={2} />
        <Group justify={sale ? "space-between" : "flex-end"}>
          {sale && (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => confirmDelete("Delete this sale?", "Its parts aren't sold any more.", () => remove.mutate(undefined))}
            >
              Delete sale
            </Button>
          )}
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!sellDate || total === null || !preview.isSuccess || Boolean(earlyPart)}>
            {sale ? "Save" : "Sell"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
