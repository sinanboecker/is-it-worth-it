import { Alert, Badge, Button, FileInput, Group, Modal, ScrollArea, Select, Stack, Table, Text } from "@mantine/core";
import { IconFileTypeCsv } from "@tabler/icons-react";
import { useState } from "react";
import { upload } from "@/api/client";
import { useApiMutation, useCategories, usePreviewRequest } from "@/api/queries";
import type { BundleImportPreview, BundleImportResult, GamePlan } from "@/api/types";
import { day, euros, hours } from "@/lib/format";
import { DeviceSelect, StoreInput } from "./inputs";

const ACTION: Record<GamePlan["action"], { label: string; color: string; hint: string }> = {
  new: { label: "new", color: "green", hint: "new game" },
  move: { label: "existing", color: "blue", hint: "its existing copy becomes the bundle copy" },
  add_copy: { label: "extra copy", color: "cyan", hint: "the game gets another copy" },
  skip: { label: "skip", color: "gray", hint: "" },
};

/** Import bundles from a sheet saved as CSV: a bundle row, its game rows, an empty row, the next bundle. */
export function BundleImportModal({ onClose }: { onClose: () => void }) {
  const categories = useCategories();
  const platforms = (categories.data ?? []).filter((c) => c.type === "platform");
  const [file, setFile] = useState<File | null>(null);
  const [categoryChoice, setCategoryChoice] = useState<number | null>(null);
  const category = platforms.find((c) => c.id === categoryChoice) ?? platforms.find((c) => c.name === "PC") ?? platforms[0];
  const [deviceChoice, setDeviceChoice] = useState<number | null | undefined>(undefined);
  const device = deviceChoice === undefined ? (category?.default_device_id ?? null) : deviceChoice;
  const [store, setStore] = useState<string | null>("Humble Bundle");
  const { result: preview, setResult: setPreview, error, loading, run } = usePreviewRequest<BundleImportPreview>();

  const form = () => {
    const data = new FormData();
    data.append("file", file!);
    data.append("category_id", String(category!.id));
    if (device) data.append("hardware_id", String(device));
    if (store) data.append("store", store);
    data.append("format", "digital");
    return data;
  };
  const runPreview = () => run(() => upload<BundleImportPreview>("/api/v1/bundles/import/preview", form()));
  const changed = () => setPreview(null);
  const commit = useApiMutation(() => upload<BundleImportResult>("/api/v1/bundles/import/commit", form()), {
    success: (r) =>
      `Imported ${r.bundles_created} bundles: ${r.games_created} new games, ${r.copies_moved} existing copies, ` +
      `${r.copies_added} extra copies`,
    onSuccess: onClose,
  });
  const blocking = preview?.bundles.filter((b) => !b.skip && b.errors.length) ?? [];

  return (
    <Modal opened onClose={onClose} title="Import bundles" size="90%">
      <Stack>
        <Text size="sm" c="dimmed">
          Save the sheet as CSV. Each bundle is a block of rows: first the bundle (name, buy date, price, sold for),
          then one row per game (name, buy date, –, sold for, hours, finished ✓, comment), then an empty row. “Sold
          for” on the bundle row is everything the bundle brought in; what isn’t on a game row counts as other sales.
          The price is split equally across the games. Games that are already in the category get their copy moved into
          the bundle and keep their hours. Nothing is saved before you click “Import”.
        </Text>
        <Group grow align="flex-end">
          <FileInput
            label="CSV file"
            accept=".csv,text/csv"
            leftSection={<IconFileTypeCsv size={18} />}
            value={file}
            onChange={(f) => {
              setFile(f);
              changed();
            }}
          />
          <Select
            label="Category of the games"
            data={platforms.map((c) => ({ value: String(c.id), label: c.name }))}
            value={category ? String(category.id) : null}
            onChange={(v) => {
              setCategoryChoice(v ? Number(v) : null);
              setDeviceChoice(undefined);
              changed();
            }}
            allowDeselect={false}
          />
          <DeviceSelect
            label="Hours of new games are booked on"
            value={device}
            onChange={(v) => {
              setDeviceChoice(v);
              changed();
            }}
          />
          <StoreInput
            label="Store"
            value={store}
            onChange={(v) => {
              setStore(v);
              changed();
            }}
          />
        </Group>
        <Group>
          <Button onClick={runPreview} loading={loading} disabled={!file || !category}>
            {preview ? "Update preview" : "Preview"}
          </Button>
        </Group>
        {error && <Alert color="red">{error}</Alert>}

        {preview && (
          <>
            <Text size="sm">
              <b>{preview.new_bundles}</b> bundles · <b>{preview.new_games}</b> new games · <b>{preview.moved_copies}</b>{" "}
              existing games · <b>{preview.added_copies}</b> extra copies
              {preview.skipped_bundles > 0 && (
                <>
                  {" "}
                  · <b>{preview.skipped_bundles}</b> bundles already imported (skipped)
                </>
              )}
            </Text>
            <ScrollArea h={460}>
              <Table striped verticalSpacing={6} fz="sm" layout="fixed" miw={900}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={60}>Line</Table.Th>
                    <Table.Th>Bundle and games</Table.Th>
                    <Table.Th w={100}>Bought</Table.Th>
                    <Table.Th w={90} ta="right">
                      Price
                    </Table.Th>
                    <Table.Th w={130} ta="right">
                      Sold for
                    </Table.Th>
                    <Table.Th w={260}>Notes</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.bundles.map((b) => (
                    <Table.Tr key={b.line} opacity={b.skip ? 0.5 : 1} style={{ verticalAlign: "top" }}>
                      <Table.Td>{b.line}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {b.name}
                        </Text>
                        <Stack gap={2} mt={2}>
                          {b.games.map((g) => (
                            <Group key={g.line} gap={6} wrap="nowrap">
                              {!b.skip && (
                                <Badge size="xs" variant="light" color={ACTION[g.action].color} title={ACTION[g.action].hint}>
                                  {ACTION[g.action].label}
                                </Badge>
                              )}
                              <Text size="xs" lineClamp={1}>
                                {g.name}
                                {g.hours > 0 && ` · ${hours(g.hours)}`}
                                {g.finished && " · ✓"}
                                {g.sold_cents !== null && ` · sold ${euros(g.sold_cents)}`}
                              </Text>
                            </Group>
                          ))}
                        </Stack>
                      </Table.Td>
                      <Table.Td>{day(b.buy_date)}</Table.Td>
                      <Table.Td ta="right">{euros(b.total_price_cents)}</Table.Td>
                      <Table.Td ta="right">
                        {b.sold_cents ? euros(b.sold_cents) : "–"}
                        {b.other_sales_cents > 0 && (
                          <Text size="xs" c="dimmed">
                            {euros(b.other_sales_cents)} other sales
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {b.errors.map((e) => (
                          <Text key={e} size="xs" c="red">
                            {e}
                          </Text>
                        ))}
                        {b.warnings.map((w) => (
                          <Text key={w} size="xs" c="dimmed">
                            {w}
                          </Text>
                        ))}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            {blocking.length > 0 && (
              <Alert color="orange">
                {blocking.length} bundle(s) have errors. Fix them in the file (or choose a device above) and update the
                preview.
              </Alert>
            )}
            <Group justify="flex-end">
              <Button onClick={() => commit.mutate(undefined)} loading={commit.isPending} disabled={!preview.can_commit || !preview.new_bundles}>
                Import {preview.new_bundles} bundles
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
