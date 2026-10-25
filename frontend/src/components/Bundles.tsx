/** Bundles (one purchase, several items): the "other items" editor for the new-hardware dialog, and the edit dialog. */
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, unwrap } from "@/api/client";
import { useApiMutation, useCategories, useItems } from "@/api/queries";
import type { Bundle, BundleEntryIn, CopyFormat, ItemKind, SplitMode } from "@/api/types";
import { day, euros, todayIso } from "@/lib/format";
import { FORMAT, options, SPLIT_MODE } from "@/lib/labels";
import { DateField, MoneyInput } from "./inputs";

/** Live preview of the split while editing (computed by the server, same algorithm as on save). */
export function useSplitPreview(
  total: number | null,
  mode: SplitMode,
  references: (number | null)[],
  manual: (number | null)[],
) {
  const [args] = useDebouncedValue({ total, mode, references, manual }, 250);
  return useQuery({
    queryKey: ["split-preview", args],
    enabled: args.total !== null && args.references.length > 0,
    retry: false,
    queryFn: () =>
      unwrap(
        api.POST("/api/v1/bundles/preview-split", {
          body: {
            total_price_cents: args.total!,
            split_mode: args.mode,
            reference_prices: args.references,
            manual_shares: args.manual,
            count: args.references.length,
          },
        }),
      ),
  });
}

export type BundleEntryDraft = {
  key: number;
  existingId: number | null;
  newName: string;
  newCategory: number | null;
  newKind: ItemKind;
  reference: number | null; // standalone price (proportional split)
  manual: number | null; // own share (manual split)
  format: CopyFormat;
};

let nextKey = 1;
export const emptyEntry = (category: number | null = null, format: CopyFormat = "physical"): BundleEntryDraft => ({
  key: nextKey++,
  existingId: null,
  newName: "",
  newCategory: category,
  newKind: "game",
  reference: null,
  manual: null,
  format,
});

export const entryComplete = (e: BundleEntryDraft) => Boolean(e.existingId || (e.newName.trim() && e.newCategory));

export const entryBody = (e: BundleEntryDraft, mode: SplitMode): BundleEntryIn => ({
  item_id: e.existingId,
  new_item: e.existingId ? null : { category_id: e.newCategory!, kind: e.newKind, name: e.newName.trim() },
  reference_price_cents: e.reference,
  buy_price_cents: mode === "manual" ? e.manual : null,
  format: e.newKind === "hardware" && !e.existingId ? "physical" : e.format,
  condition: null,
  note: null,
});

/** One further item of the bundle (an existing game/device, or a new one). */
export function BundleEntryCard({
  entry,
  mode,
  share,
  onChange,
  onRemove,
}: {
  entry: BundleEntryDraft;
  mode: SplitMode;
  share: number | undefined;
  onChange: (patch: Partial<BundleEntryDraft>) => void;
  onRemove: () => void;
}) {
  const categories = useCategories();
  const items = useItems();
  const itemOptions = (items.data ?? []).map((i) => ({ value: String(i.id), label: i.name }));
  return (
    <Card withBorder padding="sm">
      <Stack gap="xs">
        <Group grow align="flex-end">
          <Select
            label="Existing game / device"
            placeholder="…or add a new one below"
            data={itemOptions}
            value={entry.existingId ? String(entry.existingId) : null}
            onChange={(v) => onChange({ existingId: v ? Number(v) : null })}
            searchable
            clearable
          />
          {mode === "proportional" && (
            <MoneyInput label="Standalone price" value={entry.reference} onChange={(v) => onChange({ reference: v })} />
          )}
          {mode === "manual" && <MoneyInput label="Price share" value={entry.manual} onChange={(v) => onChange({ manual: v })} />}
          <Text size="sm" fw={600} ta="right">
            {share !== undefined ? euros(share) : ""}
          </Text>
        </Group>
        {!entry.existingId && (
          <Group grow align="flex-end">
            <TextInput label="New: name" value={entry.newName} onChange={(e) => onChange({ newName: e.currentTarget.value })} />
            <Select
              label="Category"
              data={(categories.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
              value={entry.newCategory ? String(entry.newCategory) : null}
              onChange={(v) => onChange({ newCategory: v ? Number(v) : null })}
            />
            <SegmentedControl
              data={[
                { value: "game", label: "Game" },
                { value: "hardware", label: "Hardware" },
              ]}
              value={entry.newKind}
              onChange={(v) => onChange({ newKind: v as ItemKind })}
            />
          </Group>
        )}
        <Group justify="space-between">
          {(entry.existingId || entry.newKind === "game") && (
            <SegmentedControl size="xs" data={options(FORMAT)} value={entry.format} onChange={(v) => onChange({ format: v as CopyFormat })} />
          )}
          <ActionIcon variant="subtle" color="red" onClick={onRemove} aria-label="Remove from bundle">
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Stack>
    </Card>
  );
}

/** Bundle part of the new-hardware dialog: split mode, further items, live shares. */
export function BundleEntriesEditor({
  mode,
  onModeChange,
  entries,
  onEntriesChange,
  shares,
  firstShare,
  defaultCategory,
  defaultFormat = "physical",
  addLabel = "Add game or accessory",
  error,
}: {
  mode: SplitMode;
  onModeChange: (mode: SplitMode) => void;
  entries: BundleEntryDraft[];
  onEntriesChange: (entries: BundleEntryDraft[]) => void;
  shares: number[] | undefined;
  firstShare: React.ReactNode;
  defaultCategory: number | null;
  defaultFormat?: CopyFormat;
  addLabel?: string;
  error?: string | null;
}) {
  const update = (key: number, patch: Partial<BundleEntryDraft>) =>
    onEntriesChange(entries.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  return (
    <Stack gap="xs">
      <Select label="Split the price" data={options(SPLIT_MODE)} value={mode} onChange={(v) => v && onModeChange(v as SplitMode)} allowDeselect={false} />
      {firstShare}
      <Text size="sm" fw={600} mt="xs">
        Also in the bundle
      </Text>
      {entries.map((entry, index) => (
        <BundleEntryCard
          key={entry.key}
          entry={entry}
          mode={mode}
          share={shares?.[index + 1]}
          onChange={(patch) => update(entry.key, patch)}
          onRemove={() => onEntriesChange(entries.filter((e) => e.key !== entry.key))}
        />
      ))}
      <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => onEntriesChange([...entries, emptyEntry(defaultCategory, defaultFormat)])}>
        {addLabel}
      </Button>
      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}
    </Stack>
  );
}

/** Edit an existing bundle: total, split, standalone prices, sale as a whole; or delete it. */
export function EditBundleModal({ bundleId, onClose }: { bundleId: number; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["bundle", bundleId],
    queryFn: () => unwrap(api.GET("/api/v1/bundles/{bundle_id}", { params: { path: { bundle_id: bundleId } } })),
  });
  return (
    <Modal opened onClose={onClose} title={query.data ? `Bundle – ${query.data.name}` : "Bundle"} size="lg">
      {query.data ? <EditBundleForm bundle={query.data} onClose={onClose} /> : query.isError ? <Alert color="red">{query.error.message}</Alert> : null}
    </Modal>
  );
}

function EditBundleForm({ bundle, onClose }: { bundle: Bundle; onClose: () => void }) {
  const [name, setName] = useState(bundle.name);
  const [buyDate, setBuyDate] = useState<string | null>(bundle.buy_date);
  const [total, setTotal] = useState<number | null>(bundle.total_price_cents);
  const [mode, setMode] = useState<SplitMode>(bundle.split_mode);
  const [references, setReferences] = useState(bundle.copies.map((c) => c.reference_price_cents));
  const [manual, setManual] = useState<(number | null)[]>(bundle.copies.map((c) => c.buy_price_cents));
  const [soldAsBundle, setSoldAsBundle] = useState(bundle.sold_as_bundle);
  const [sellTotal, setSellTotal] = useState(bundle.sell_total_cents);
  const [sellDate, setSellDate] = useState(bundle.sell_date ?? todayIso());
  const preview = useSplitPreview(total, mode, references, manual);
  const save = useApiMutation(
    () =>
      unwrap(
        api.PATCH("/api/v1/bundles/{bundle_id}", {
          params: { path: { bundle_id: bundle.id } },
          body: {
            name: name.trim(),
            buy_date: buyDate,
            total_price_cents: total!,
            split_mode: mode,
            reference_prices: Object.fromEntries(bundle.copies.map((c, i) => [c.copy_id, references[i] ?? 0])),
            manual_shares: mode === "manual" ? Object.fromEntries(bundle.copies.map((c, i) => [c.copy_id, manual[i] ?? 0])) : null,
            sold_as_bundle: soldAsBundle,
            sell_total_cents: soldAsBundle ? sellTotal : null,
            sell_date: soldAsBundle ? sellDate : null,
          },
        }),
      ),
    { success: "Bundle saved", onSuccess: onClose },
  );
  const remove = useApiMutation(
    () => unwrap(api.DELETE("/api/v1/bundles/{bundle_id}", { params: { path: { bundle_id: bundle.id } } })),
    { success: "Bundle deleted", onSuccess: onClose },
  );
  return (
    <Stack>
      <Group grow>
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <DateField label="Bought on" value={buyDate} onChange={setBuyDate} />
      </Group>
      <Group grow>
        <MoneyInput label="Total price" value={total} onChange={setTotal} />
        <Select label="Split" data={options(SPLIT_MODE)} value={mode} onChange={(v) => v && setMode(v as SplitMode)} allowDeselect={false} />
      </Group>
      <Table>
        <Table.Tbody>
          {bundle.copies.map((c, i) => (
            <Table.Tr key={c.copy_id}>
              <Table.Td>{c.item_name}</Table.Td>
              <Table.Td w={170}>
                {mode === "proportional" && (
                  <MoneyInput size="xs" placeholder="standalone price" value={references[i]} onChange={(v) => setReferences((r) => r.map((x, j) => (j === i ? v : x)))} />
                )}
                {mode === "manual" && (
                  <MoneyInput size="xs" value={manual[i]} onChange={(v) => setManual((m) => m.map((x, j) => (j === i ? v : x)))} />
                )}
              </Table.Td>
              <Table.Td ta="right" fw={600}>
                {preview.data ? euros(preview.data.shares_cents[i]) : ""}
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
      <Checkbox label="Sold as a whole" checked={soldAsBundle} onChange={(e) => setSoldAsBundle(e.currentTarget.checked)} />
      {soldAsBundle && (
        <Group grow>
          <MoneyInput label="Sold for (total)" value={sellTotal} onChange={setSellTotal} />
          <DateField label="Sold on" value={sellDate} onChange={(v) => setSellDate(v ?? todayIso())} />
        </Group>
      )}
      <Text size="xs" c="dimmed">
        Bought {day(bundle.buy_date)}
        {bundle.store && ` at ${bundle.store}`}. Copies bought in the bundle can't be deleted on their own.
      </Text>
      <Group justify="space-between">
        <Button
          variant="subtle"
          color="red"
          leftSection={<IconTrash size={16} />}
          onClick={() =>
            modals.openConfirmModal({
              title: `Delete ${bundle.name}?`,
              children: <Text size="sm">The copies bought in this bundle are deleted; the games and devices stay.</Text>,
              labels: { confirm: "Delete", cancel: "Cancel" },
              confirmProps: { color: "red" },
              onConfirm: () => remove.mutate(undefined),
            })
          }
        >
          Delete bundle
        </Button>
        <Button
          onClick={() => save.mutate(undefined)}
          loading={save.isPending}
          disabled={!name.trim() || total === null || !preview.isSuccess || (soldAsBundle && sellTotal === null)}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}
