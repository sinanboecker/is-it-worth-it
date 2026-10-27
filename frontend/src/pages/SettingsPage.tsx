import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Card,
  FileInput,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconBrandGithub, IconDownload, IconEdit, IconPlus, IconSearch, IconTrash, IconUpload } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useState, type ReactNode } from "react";
import { api, unwrap, upload } from "@/api/client";
import { useApiMutation, useCategories, useHardware, useMetadataStatus, useSettings } from "@/api/queries";
import { FetchMissingModal, RawgAttribution, RawgNotConfigured } from "@/components/MetadataModals";
import type { AppSettings, Category, SplitMode } from "@/api/types";
import { confirmDelete, PageHeader, QueryView } from "@/components/common";
import { CategoryIconFor } from "@/components/CategoryIcon";
import { CategoryModal } from "@/components/CategoryModal";
import { MoneyInput } from "@/components/inputs";
import { perHour } from "@/lib/format";
import { options, SPLIT_MODE } from "@/lib/labels";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card withBorder padding="md">
      <Title order={4} mb="sm">
        {title}
      </Title>
      {children}
    </Card>
  );
}

function GeneralSettings({ settings }: { settings: AppSettings }) {
  const [breakEven, setBreakEven] = useState<number | null>(settings.break_even_cph ?? 300);
  const [splitMode, setSplitMode] = useState<SplitMode>(settings.bundle_split_mode ?? "proportional");
  const [region, setRegion] = useState(settings.ggdeals_region ?? "de");
  const save = useApiMutation(
    () =>
      unwrap(
        api.PUT("/api/v1/settings", {
          body: { break_even_cph: breakEven, bundle_split_mode: splitMode, ggdeals_region: region },
        }),
      ),
    { success: "Settings saved" },
  );
  return (
    <Section title="General">
      <Stack maw={480}>
        <MoneyInput
          label="Break-even (per hour)"
          description="A game or device is “worth it” at this cost per hour or less. Categories can override it."
          value={breakEven}
          onChange={setBreakEven}
        />
        <Select
          label="Default bundle split"
          data={options(SPLIT_MODE)}
          value={splitMode}
          onChange={(v) => v && setSplitMode(v as SplitMode)}
          allowDeselect={false}
        />
        <TextInput
          label="gg.deals region"
          description="Used for wishlist prices (later milestone)"
          value={region}
          onChange={(e) => setRegion(e.currentTarget.value)}
        />
        <Group>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!breakEven}>
            Save
          </Button>
        </Group>
      </Stack>
    </Section>
  );
}

function CategoriesSettings({ settings }: { settings: AppSettings }) {
  const categories = useCategories();
  const hardware = useHardware();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const remove = useApiMutation(
    (c: Category) => unwrap(api.DELETE("/api/v1/categories/{category_id}", { params: { path: { category_id: c.id } } })),
    { success: "Category deleted" },
  );
  const deviceName = (id: number | null) => hardware.data?.find((h) => h.id === id)?.name ?? "–";
  return (
    <Section title="Categories">
      <QueryView query={categories}>
        {(rows) => (
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Default device</Table.Th>
                <Table.Th>Break-even</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <CategoryIconFor category={c} />
                      {c.name}
                    </Group>
                  </Table.Td>
                  <Table.Td>{c.type === "platform" ? "Platform" : "Hardware only"}</Table.Td>
                  <Table.Td>{deviceName(c.default_device_id)}</Table.Td>
                  <Table.Td>
                    {c.break_even_cph !== null ? (
                      perHour(c.break_even_cph)
                    ) : (
                      <Text size="sm" c="dimmed">
                        default ({perHour(settings.break_even_cph)})
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <ActionIcon variant="subtle" onClick={() => setEditing(c)} aria-label="Edit category">
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Delete category"
                        onClick={() =>
                          confirmDelete(`Delete ${c.name}?`, "Only empty categories can be deleted.", () => remove.mutate(c))
                        }
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </QueryView>
      <Button mt="sm" variant="light" leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
        New category
      </Button>
      {editing && <CategoryModal category={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

function DataSettings() {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"empty" | "replace">("empty");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runImport = async () => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    setError(null);
    try {
      const counts = await upload<Record<string, number>>(`/api/v1/import/json?mode=${mode}`, form);
      await client.invalidateQueries();
      notifications.show({
        color: "green",
        message: `Imported ${counts.items ?? 0} games/devices, ${counts.copies ?? 0} copies, ${counts.completions ?? 0} finishes`,
      });
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = () =>
    mode === "replace"
      ? confirmDelete("Replace everything?", "All current data is deleted and replaced by the file's content.", runImport, "Replace")
      : runImport();

  return (
    <Section title="Export & import">
      <Stack>
        <div>
          <Text size="sm" mb="xs">
            Export everything as one JSON file (a complete backup that can be imported again). Password-free: no API keys
            are included.
          </Text>
          <Group>
            <Button component="a" href="/api/v1/export/json" leftSection={<IconDownload size={16} />}>
              Export JSON
            </Button>
            <Button component="a" href="/api/v1/export/json?images=true" variant="light" leftSection={<IconDownload size={16} />}>
              Export JSON + images (ZIP)
            </Button>
          </Group>
        </div>
        <div>
          <Text size="sm" mb="xs">
            Import a JSON or ZIP export. “Empty database” only works when there are no games or devices yet.
          </Text>
          <Group align="flex-end">
            <FileInput label="Export file" accept=".json,.zip" value={file} onChange={setFile} w={280} />
            <SegmentedControl
              data={[
                { value: "empty", label: "Empty database" },
                { value: "replace", label: "Replace everything" },
              ]}
              value={mode}
              onChange={(v) => setMode(v as "empty" | "replace")}
            />
            <Button leftSection={<IconUpload size={16} />} onClick={confirmImport} loading={busy} disabled={!file}>
              Import
            </Button>
          </Group>
          {error && (
            <Alert color="red" mt="sm">
              {error}
            </Alert>
          )}
        </div>
        <Text size="sm">
          Games from a spreadsheet are imported per category via “Import CSV” on the category page (
          <Anchor href="/api/v1/import-csv/template">CSV template</Anchor>).
        </Text>
      </Stack>
    </Section>
  );
}

function MetadataSettings() {
  const status = useMetadataStatus();
  const [open, setOpen] = useState(false);
  return (
    <Section title="Game info (RAWG)">
      <Stack>
        {status.data?.rawg ? (
          <Text size="sm">
            RAWG is set up. Info and images are loaded when you add a game, from “Find info” on a game's page, or for all
            games at once:
          </Text>
        ) : (
          <RawgNotConfigured />
        )}
        <Group>
          <Button variant="light" leftSection={<IconSearch size={16} />} onClick={() => setOpen(true)} disabled={!status.data?.rawg}>
            Fetch missing game info
          </Button>
        </Group>
        <RawgAttribution />
      </Stack>
      {open && <FetchMissingModal onClose={() => setOpen(false)} />}
    </Section>
  );
}

const REPOSITORY = "https://github.com/sinanboecker/is-it-worth-it";

function AboutSection() {
  return (
    <Section title="About">
      <Table variant="vertical" withTableBorder={false} maw={480}>
        <Table.Tbody>
          <Table.Tr>
            <Table.Th w={140}>Version</Table.Th>
            <Table.Td>
              <Anchor href={`${REPOSITORY}/tree/v${__APP_VERSION__}`} target="_blank" rel="noreferrer">
                {__APP_VERSION__}
              </Anchor>
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Source code</Table.Th>
            <Table.Td>
              <Anchor href={REPOSITORY} target="_blank" rel="noreferrer">
                <Group gap={6} wrap="nowrap">
                  <IconBrandGithub size={16} />
                  github.com/sinanboecker/is-it-worth-it
                </Group>
              </Anchor>
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>License</Table.Th>
            <Table.Td>MIT</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Section>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  return (
    <Stack>
      <PageHeader title="Settings" />
      <QueryView query={settings}>
        {(s) => (
          <Stack>
            <GeneralSettings settings={s} />
            <CategoriesSettings settings={s} />
            <MetadataSettings />
            <DataSettings />
            <AboutSection />
          </Stack>
        )}
      </QueryView>
    </Stack>
  );
}
