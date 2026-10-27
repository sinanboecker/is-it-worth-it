import { Alert, Badge, Button, FileInput, Group, Modal, ScrollArea, SegmentedControl, Select, Stack, Table, Text } from "@mantine/core";
import { IconFileText } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { api, unwrap, upload } from "@/api/client";
import { useApiMutation, useCategories, useItems, usePreviewRequest } from "@/api/queries";
import type { FinishImportPreview, FinishRow } from "@/api/types";
import { day } from "@/lib/format";

const ACTION: Record<FinishRow["action"], { label: string; color: string }> = {
  fill: { label: "fills the date", color: "green" },
  add: { label: "adds a finish", color: "blue" },
  already: { label: "already there", color: "gray" },
  skip: { label: "skipped", color: "gray" },
};

const MATCH_HINT: Partial<Record<FinishRow["match"], { label: string; color: string }>> = {
  suggested: { label: "similar name, check", color: "orange" },
  ambiguous: { label: "several games, pick one", color: "orange" },
  not_found: { label: "not found", color: "gray" },
  picked: { label: "picked", color: "blue" },
};

// lines to look at, including the ones the user picked a game for (so they don't vanish while checking)
const needsLook = (r: FinishRow) => r.errors.length > 0 || r.match !== "exact";

const toInput = (r: FinishRow) => ({
  line: r.line,
  finished_on: r.finished_on,
  name: r.name,
  platform: r.platform,
  item_id: r.item_id,
  picked: r.picked,
  errors: r.errors,
});

/** Import finish dates from a list: "Month, YYYY" headings, then "DD Game name, Platform" lines. */
export function FinishImportModal({ onClose }: { onClose: () => void }) {
  const games = useItems({ kind: "game" });
  const categories = useCategories();
  const [file, setFile] = useState<File | null>(null);
  const { result: preview, setResult: setPreview, error, loading, run } = usePreviewRequest<FinishImportPreview>();
  const [show, setShow] = useState<"all" | "look">("look");

  const gameOptions = useMemo(() => {
    const names = new Map(categories.data?.map((c) => [c.id, c.name]));
    return (games.data ?? [])
      .map((g) => ({ value: String(g.id), label: `${g.name} (${names.get(g.category_id) ?? "?"})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [games.data, categories.data]);

  const runPreview = () =>
    run(() => {
      const form = new FormData();
      form.append("file", file!);
      return upload<FinishImportPreview>("/api/v1/import/finish-dates/preview", form);
    });
  const pick = (line: number, itemId: number | null) =>
    run(() =>
      unwrap(
        api.POST("/api/v1/import/finish-dates/plan", {
          body: { rows: preview!.rows.map((r) => (r.line === line ? { ...toInput(r), item_id: itemId, picked: true } : toInput(r))) },
        }),
      ),
    );
  const commit = useApiMutation(
    () => unwrap(api.POST("/api/v1/import/finish-dates/commit", { body: { rows: preview!.rows.map(toInput) } })),
    {
      success: (r) => `Finish dates imported: ${r.filled} dates filled in, ${r.added} finishes added, ${r.already} already there`,
      onSuccess: onClose,
    },
  );

  const rows = preview ? preview.rows.filter((r) => show === "all" || needsLook(r)) : [];
  const toLook = preview?.rows.filter(needsLook).length ?? 0;
  const blocking = preview?.rows.filter((r) => r.item_id !== null && r.errors.length).length ?? 0;

  return (
    <Modal opened onClose={onClose} title="Import finish dates" size="90%">
      <Stack>
        <Text size="sm" c="dimmed">
          A plain text list: month headings like “September, 2026”, then one line per finished game like “29 Resonance:
          A Plague Tale Legacy, PC” (day, name, platform). Games are matched by name; the platform helps when a name is in
          several categories. A finish with an unknown date gets the date, a finish on the same date is left alone, and
          other dates are added as finishes. Nothing is saved before you click “Import”.
        </Text>
        <Group align="flex-end">
          <FileInput
            label="List of finish dates"
            leftSection={<IconFileText size={18} />}
            value={file}
            onChange={(f) => {
              setFile(f);
              setPreview(null);
            }}
            w={320}
          />
          <Button onClick={runPreview} loading={loading && !preview} disabled={!file}>
            Preview
          </Button>
        </Group>
        {error && <Alert color="red">{error}</Alert>}

        {preview && (
          <>
            <Group justify="space-between">
              <Text size="sm">
                <b>{preview.fill}</b> dates filled in · <b>{preview.add}</b> finishes added · <b>{preview.already}</b> already there
                · <b>{preview.skip}</b> skipped
              </Text>
              <SegmentedControl
                size="xs"
                data={[
                  { value: "look", label: `To check (${toLook})` },
                  { value: "all", label: `All (${preview.rows.length})` },
                ]}
                value={show}
                onChange={(v) => setShow(v as "all" | "look")}
              />
            </Group>
            <ScrollArea h={460}>
              <Table striped verticalSpacing={4} fz="sm" layout="fixed" miw={900}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={100}>Finished</Table.Th>
                    <Table.Th>In the list</Table.Th>
                    <Table.Th w={320}>Game</Table.Th>
                    <Table.Th w={260}>Result</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((r) => {
                    const hint = MATCH_HINT[r.match];
                    return (
                      <Table.Tr key={r.line}>
                        <Table.Td>{day(r.finished_on)}</Table.Td>
                        <Table.Td>
                          <Text size="sm" lineClamp={1}>
                            {r.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            line {r.line}
                            {r.platform && ` · ${r.platform}`}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {r.finished_on && (
                            <Select
                              size="xs"
                              aria-label={`Game for line ${r.line}`}
                              placeholder="Skip this line"
                              data={gameOptions}
                              value={r.item_id ? String(r.item_id) : null}
                              onChange={(v) => pick(r.line, v ? Number(v) : null)}
                              searchable
                              clearable
                              disabled={loading}
                              nothingFoundMessage="No game with that name"
                            />
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4}>
                            <Badge size="sm" variant="light" color={ACTION[r.action].color} tt="none">
                              {ACTION[r.action].label}
                            </Badge>
                            {hint && (
                              <Badge size="sm" variant="outline" color={hint.color} tt="none">
                                {hint.label}
                              </Badge>
                            )}
                          </Group>
                          {r.errors.map((e) => (
                            <Text key={e} size="xs" c="red">
                              {e}
                            </Text>
                          ))}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={4}>
                        <Text size="sm" c="dimmed" ta="center" py="md">
                          Nothing to check: every line was matched.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            {blocking > 0 && (
              <Alert color="orange">
                {blocking} line(s) can't be imported as they are (see the red notes). Pick another game or clear the game to
                skip them.
              </Alert>
            )}
            <Group justify="flex-end">
              <Button onClick={() => commit.mutate(undefined)} loading={commit.isPending} disabled={!preview.can_commit || loading}>
                Import {preview.fill + preview.add} finishes
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
