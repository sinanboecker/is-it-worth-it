import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconFileTypeCsv } from "@tabler/icons-react";
import { useState } from "react";
import { api, unwrap, upload } from "@/api/client";
import { useApiMutation, usePreviewRequest } from "@/api/queries";
import type { Category, CommitResult, CopyFormat, ImportPreview, ImportRow } from "@/api/types";
import { day, euros, hours } from "@/lib/format";
import { FORMAT, options, STATUS } from "@/lib/labels";
import { DeviceSelect, StoreInput } from "./inputs";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  buy_date: "Buy date",
  buy_price: "Buy price",
  sell_date: "Sell date",
  sell_price: "Sell price",
  hours: "Hours",
  store: "Store",
  format: "Format",
  condition: "Condition",
  status: "Status",
  rating: "Rating",
  finished: "Finished",
  notes: "Notes",
};

const ACTION_LABEL: Record<ImportRow["action"], string> = {
  create: "new",
  add_copy: "extra copy",
  wishlist: "wishlist",
  skip: "skip",
};

const ACTION_COLOR: Record<ImportRow["action"], string> = {
  create: "green",
  add_copy: "blue",
  wishlist: "grape",
  skip: "gray",
};

export function CsvImportModal({
  category,
  opened,
  onClose,
  onImported,
}: {
  category: Category;
  opened: boolean;
  onClose: () => void;
  onImported?: (result: CommitResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [device, setDevice] = useState<number | null>(category.default_device_id);
  const [store, setStore] = useState<string | null>(null);
  const [format, setFormat] = useState<CopyFormat>("digital");
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const { result: preview, setResult: setPreview, error, loading, run } = usePreviewRequest<ImportPreview>();
  const [rows, setRows] = useState<ImportRow[]>([]);

  const runPreview = async (overrides = mapping) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    if (device) form.append("hardware_id", String(device));
    if (store) form.append("default_store", store);
    form.append("default_format", format);
    if (Object.keys(overrides).length) form.append("mapping", JSON.stringify(overrides));
    await run(async () => {
      const result = await upload<ImportPreview>(`/api/v1/categories/${category.id}/import-csv/preview`, form);
      setRows(result.rows);
      return result;
    });
  };

  const commit = useApiMutation(
    () =>
      unwrap(
        api.POST("/api/v1/categories/{category_id}/import-csv/commit", {
          params: { path: { category_id: category.id } },
          body: { rows },
        }),
      ),
    {
      success: (r) =>
        `Imported ${r.games_created} games, ${r.copies_added} extra copies, ${r.wishlist_added} wishlist entries`,
      onSuccess: (result) => {
        setPreview(null);
        setFile(null);
        onClose();
        onImported?.(result);
      },
    },
  );

  const original = (line: number) => preview?.rows.find((r) => r.line === line)?.action ?? "skip";
  const setAction = (line: number, action: ImportRow["action"]) =>
    setRows((rs) => rs.map((r) => (r.line === line ? { ...r, action } : r)));
  const blocking = rows.filter((r) => r.action !== "skip" && r.errors.length);

  return (
    <Modal opened={opened} onClose={onClose} title={`Import games from CSV – ${category.name}`} size="90%">
      <Stack>
        <Text size="sm" c="dimmed">
          Save a sheet as CSV (e.g. in Excel: “Save as → CSV”) and upload it. Columns are recognized by their header
          (German or English); calculated columns are ignored. Nothing is saved before you click “Import”.{" "}
          <Anchor href="/api/v1/import-csv/template" size="sm">
            Download a template
          </Anchor>
        </Text>
        <Group grow align="flex-end">
          <FileInput
            label="CSV file"
            accept=".csv,text/csv"
            leftSection={<IconFileTypeCsv size={18} />}
            value={file}
            onChange={(f) => {
              setFile(f);
              setPreview(null);
              setMapping({});
            }}
          />
          <DeviceSelect label="Hours are booked on" value={device} onChange={setDevice} />
          <StoreInput label="Store (if the file has none)" value={store} onChange={setStore} />
          <SegmentedControl data={options(FORMAT)} value={format} onChange={(v) => setFormat(v as CopyFormat)} />
        </Group>
        <Group>
          <Button onClick={() => runPreview()} loading={loading} disabled={!file}>
            {preview ? "Update preview" : "Preview"}
          </Button>
        </Group>
        {error && <Alert color="red">{error}</Alert>}

        {preview && (
          <>
            <Group gap="xs" wrap="wrap">
              <Text size="sm" fw={600}>
                Columns:
              </Text>
              {Object.entries(FIELD_LABELS).map(([field, label]) => (
                <Select
                  key={field}
                  size="xs"
                  w={150}
                  label={label}
                  data={preview.headers.filter(Boolean)}
                  value={preview.mapping[field] ?? null}
                  clearable
                  onChange={(header) => {
                    const next = { ...mapping, [field]: header };
                    setMapping(next);
                    runPreview(next);
                  }}
                />
              ))}
            </Group>
            {preview.ignored_columns.length > 0 && (
              <Text size="xs" c="dimmed">
                Ignored columns: {preview.ignored_columns.join(", ")}
              </Text>
            )}
            <Group gap="lg">
              <Text size="sm">
                <b>{preview.totals.create}</b> new · <b>{preview.totals.add_copy}</b> extra copies ·{" "}
                <b>{preview.totals.wishlist}</b> wishlist · <b>{preview.totals.skip}</b> skipped
              </Text>
              <Text size="sm">
                {euros(preview.totals.spent_cents)} · {hours(preview.totals.hours)}
              </Text>
            </Group>
            <ScrollArea h={420}>
              <Table striped verticalSpacing={4} fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Line</Table.Th>
                    <Table.Th>Action</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Bought</Table.Th>
                    <Table.Th ta="right">Price</Table.Th>
                    <Table.Th ta="right">Sold for</Table.Th>
                    <Table.Th ta="right">Hours</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Notes</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((row) => (
                    <Table.Tr key={row.line}>
                      <Table.Td>{row.line}</Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Checkbox
                            aria-label="import this row"
                            checked={row.action !== "skip"}
                            disabled={original(row.line) === "skip"}
                            onChange={(e) => setAction(row.line, e.currentTarget.checked ? original(row.line) : "skip")}
                          />
                          <Badge size="sm" variant="light" color={ACTION_COLOR[row.action]}>
                            {ACTION_LABEL[row.action]}
                          </Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td>{row.name}</Table.Td>
                      <Table.Td>{!row.buy_date && (row.action === "create" || row.action === "add_copy") ? "unknown" : day(row.buy_date)}</Table.Td>
                      <Table.Td ta="right">{euros(row.buy_price_cents)}</Table.Td>
                      <Table.Td ta="right">{euros(row.sell_price_cents)}</Table.Td>
                      <Table.Td ta="right">{row.hours ? hours(row.hours) : ""}</Table.Td>
                      <Table.Td>
                        {row.status && STATUS[row.status].label}
                        {row.finished && !row.finished_on && row.status !== "finished" && " (finished)"}
                      </Table.Td>
                      <Table.Td>
                        {row.errors.map((e) => (
                          <Text key={e} size="xs" c="red">
                            {e}
                          </Text>
                        ))}
                        {row.warnings.map((w) => (
                          <Tooltip key={w} label={w}>
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {w}
                            </Text>
                          </Tooltip>
                        ))}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            {blocking.length > 0 && (
              <Alert color="orange">
                {blocking.length} row(s) have errors. Fix them in the file (or choose a device above), or set them to
                “skip”.
              </Alert>
            )}
            <Group justify="flex-end">
              <Button onClick={() => commit.mutate(undefined)} loading={commit.isPending} disabled={blocking.length > 0}>
                Import {rows.filter((r) => r.action !== "skip").length} rows
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
