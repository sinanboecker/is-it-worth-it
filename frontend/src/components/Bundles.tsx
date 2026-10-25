/** Bundles (one purchase, several items): the "other items" editor for the new-item dialog, the new-bundle dialog and
 * the edit dialog. */
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
import { useEffect, useRef, useState } from "react";
import { api, unwrap } from "@/api/client";
import { useApiMutation, useCategories, useItems } from "@/api/queries";
import type { Bundle, BundleEntryIn, CopyFormat, ItemKind, SplitMode } from "@/api/types";
import { day, euros, todayIso } from "@/lib/format";
import { FORMAT, options, SPLIT_MODE } from "@/lib/labels";
import { DateField, MoneyInput, StoreInput } from "./inputs";

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
  gamesOnly = false,
}: {
  entry: BundleEntryDraft;
  mode: SplitMode;
  share: number | undefined;
  onChange: (patch: Partial<BundleEntryDraft>) => void;
  onRemove: () => void;
  gamesOnly?: boolean;
}) {
  const categories = useCategories();
  const items = useItems();
  const itemOptions = (items.data ?? [])
    .filter((i) => !gamesOnly || i.kind === "game")
    .map((i) => ({ value: String(i.id), label: i.name }));
  return (
    <Card withBorder padding="sm">
      <Stack gap="xs">
        <Group grow align="flex-end">
          <Select
            label={gamesOnly ? "Existing game" : "Existing game / device"}
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
              data={(categories.data ?? [])
                .filter((c) => !gamesOnly || c.type === "platform")
                .map((c) => ({ value: String(c.id), label: c.name }))}
              value={entry.newCategory ? String(entry.newCategory) : null}
              onChange={(v) => onChange({ newCategory: v ? Number(v) : null })}
            />
            {!gamesOnly && (
              <SegmentedControl
                data={[
                  { value: "game", label: "Game" },
                  { value: "hardware", label: "Hardware" },
                ]}
                value={entry.newKind}
                onChange={(v) => onChange({ newKind: v as ItemKind })}
              />
            )}
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

const validUrl = (url: string) => !url.trim() || /^https?:\/\/\S+$/.test(url.trim());

/** What the bundle's copies share: the price minus money from selling untracked parts (same as the server). */
const costToSplit = (total: number | null, otherSales: number | null) => (total === null ? null : Math.max(total - (otherSales ?? 0), 0));

/** Link and "other sales" fields, shared by the new and the edit dialog. */
function LinkInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  return (
    <TextInput
      label="Link"
      placeholder="https://…"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      error={validUrl(value) ? null : "Start the link with http:// or https://"}
    />
  );
}

function OtherSalesInput({ value, onChange }: { value: number | null; onChange: (cents: number | null) => void }) {
  return (
    <MoneyInput
      label="Earned from other sales"
      description="Games or keys from this bundle you sold without listing them as games. Lowers what the listed games cost."
      value={value}
      onChange={onChange}
    />
  );
}

/** New bundle: name, link, price and date on top, then the games one by one. */
export function AddBundleModal({ onClose }: { onClose: () => void }) {
  const categories = useCategories();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [buyDate, setBuyDate] = useState<string | null>(todayIso());
  const [store, setStore] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [otherSales, setOtherSales] = useState<number | null>(null);
  const [modeChoice, setModeChoice] = useState<SplitMode | null>(null);
  const mode: SplitMode = modeChoice ?? "equal"; // game bundles: equal shares unless chosen otherwise
  const [entries, setEntries] = useState<BundleEntryDraft[]>([]);
  const firstPlatform = categories.data?.find((c) => c.type === "platform")?.id ?? null;
  const started = useRef(false);
  useEffect(() => {
    // one empty game to start with, once the categories are there (removing it leaves a bundle without games)
    if (categories.data && !started.current) {
      started.current = true;
      setEntries([emptyEntry(firstPlatform, "digital")]);
    }
  }, [categories.data, firstPlatform]);
  const update = (key: number, patch: Partial<BundleEntryDraft>) => setEntries((es) => es.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  // a new game starts with the category and format of the one before
  const addGame = () => {
    const last = entries.at(-1);
    setEntries([...entries, emptyEntry(last?.newCategory ?? firstPlatform, last?.format ?? "digital")]);
  };
  const shared = costToSplit(total, otherSales);
  const preview = useSplitPreview(
    shared,
    mode,
    entries.map((e) => e.reference),
    entries.map((e) => e.manual),
  );
  const create = useApiMutation(
    () =>
      unwrap(
        api.POST("/api/v1/bundles", {
          body: {
            name: name.trim(),
            url: url.trim() || null,
            buy_date: buyDate!,
            total_price_cents: total!,
            other_sales_cents: otherSales ?? 0,
            store,
            split_mode: mode,
            notes: null,
            entries: entries.map((e) => entryBody(e, mode)),
          },
        }),
      ),
    { success: (b) => `Bundle “${b.name}” added with ${b.copies.length} game(s)`, onSuccess: onClose },
  );
  const complete =
    name.trim() && validUrl(url) && buyDate && total !== null && entries.every(entryComplete) && (!entries.length || preview.isSuccess);
  return (
    <Modal opened onClose={onClose} title="New bundle" size="lg">
      <Stack>
        <TextInput label="Name" placeholder="e.g. Humble Indie Bundle 23" value={name} onChange={(e) => setName(e.currentTarget.value)} required data-autofocus />
        <LinkInput value={url} onChange={setUrl} />
        <Group grow align="flex-start">
          <DateField label="Bought on" value={buyDate} onChange={setBuyDate} required />
          <StoreInput value={store} onChange={setStore} />
        </Group>
        <Group grow align="flex-start">
          <MoneyInput label="Price" value={total} onChange={setTotal} required />
          <Select label="Split the price" data={options(SPLIT_MODE)} value={mode} onChange={(v) => v && setModeChoice(v as SplitMode)} allowDeselect={false} />
        </Group>
        <OtherSalesInput value={otherSales} onChange={setOtherSales} />
        <Group justify="space-between" mt="xs">
          <Text size="sm" fw={600}>
            Games
          </Text>
          {shared !== null && entries.length > 0 && (
            <Text size="sm" c="dimmed">
              {euros(shared)} shared by {entries.length} game{entries.length === 1 ? "" : "s"}
            </Text>
          )}
        </Group>
        {!entries.length && (
          <Text size="sm" c="dimmed">
            No games: the bundle only keeps its price and the money from the sales (e.g. all games were sold).
          </Text>
        )}
        {entries.map((entry, index) => (
          <BundleEntryCard
            key={entry.key}
            entry={entry}
            mode={mode}
            share={preview.data?.shares_cents[index]}
            onChange={(patch) => update(entry.key, patch)}
            onRemove={() => setEntries((es) => es.filter((e) => e.key !== entry.key))}
            gamesOnly
          />
        ))}
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={addGame}>
          Add game
        </Button>
        {preview.isError && (
          <Text c="red" size="sm">
            {preview.error.message}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate(undefined)} loading={create.isPending} disabled={!complete}>
            Add bundle
          </Button>
        </Group>
      </Stack>
    </Modal>
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
  const [url, setUrl] = useState(bundle.url ?? "");
  const [otherSales, setOtherSales] = useState<number | null>(bundle.other_sales_cents || null);
  const [mode, setMode] = useState<SplitMode>(bundle.split_mode);
  const [references, setReferences] = useState(bundle.copies.map((c) => c.reference_price_cents));
  const [manual, setManual] = useState<(number | null)[]>(bundle.copies.map((c) => c.buy_price_cents));
  const [soldAsBundle, setSoldAsBundle] = useState(bundle.sold_as_bundle);
  const [sellTotal, setSellTotal] = useState(bundle.sell_total_cents);
  const [sellDate, setSellDate] = useState(bundle.sell_date ?? todayIso());
  const preview = useSplitPreview(costToSplit(total, otherSales), mode, references, manual);
  const save = useApiMutation(
    () =>
      unwrap(
        api.PATCH("/api/v1/bundles/{bundle_id}", {
          params: { path: { bundle_id: bundle.id } },
          body: {
            name: name.trim(),
            buy_date: buyDate,
            total_price_cents: total!,
            url: url.trim() || null,
            other_sales_cents: otherSales ?? 0,
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
      <LinkInput value={url} onChange={setUrl} />
      <OtherSalesInput value={otherSales} onChange={setOtherSales} />
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
      {bundle.copies.length > 0 && (
        <Checkbox label="Sold as a whole" checked={soldAsBundle} onChange={(e) => setSoldAsBundle(e.currentTarget.checked)} />
      )}
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
          disabled={
            !name.trim() || !validUrl(url) || total === null || (bundle.copies.length > 0 && !preview.isSuccess) || (soldAsBundle && sellTotal === null)
          }
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}
