import {
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconFileImport } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useCategories, useHeatmap, useJournal } from "@/api/queries";
import type { JournalEntry } from "@/api/types";
import { Cover, Empty, PageHeader, QueryView } from "@/components/common";
import { FinishImportModal } from "@/components/FinishImportModal";
import { HeatmapCalendar } from "@/components/HeatmapCalendar";
import { DeviceSelect, Stars } from "@/components/inputs";
import { day, hours, monthName, perHour } from "@/lib/format";

function EntryCard({ entry, onOpen }: { entry: JournalEntry; onOpen: () => void }) {
  return (
    <Card withBorder padding="xs" style={{ cursor: "pointer" }} onClick={onOpen}>
      <Stack gap={4} align="center">
        <div style={{ position: "relative", width: "100%" }}>
          <Cover name={entry.name} path={entry.cover_path} width="100%" />
          {entry.finished_on && (
            <Badge size="lg" circle style={{ position: "absolute", top: -8, left: -8 }}>
              {Number(entry.finished_on.slice(8, 10))}
            </Badge>
          )}
        </div>
        <Text size="sm" fw={500} ta="center" lineClamp={2}>
          {entry.name}
        </Text>
        <Stars value={entry.rating} size="xs" />
        <Group gap={4} justify="center">
          {entry.replay && (
            <Badge size="xs" variant="light">
              Replay
            </Badge>
          )}
          {entry.mastered && (
            <Badge size="xs" color="yellow">
              100 %
            </Badge>
          )}
          {entry.emulated && (
            <Badge size="xs" variant="outline">
              🕹
            </Badge>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

function EntryModal({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  return (
    <Modal opened onClose={onClose} title={entry.name}>
      <Stack gap="xs">
        <Group align="flex-start" wrap="nowrap">
          <Cover name={entry.name} path={entry.cover_path} width={200} />
          <Stack gap={4}>
            <Text size="sm">
              Finished {entry.finished_on ? day(entry.finished_on) : "(date unknown)"}
              {entry.started_on && ` · started ${day(entry.started_on)}`}
            </Text>
            {entry.hardware_name && (
              <Text size="sm">
                on {entry.hardware_name}
                {entry.emulated && " (emulated)"}
              </Text>
            )}
            <Text size="sm">
              {hours(entry.hours)} · {perHour(entry.cost_per_hour_cents)}
            </Text>
            <Group gap="xs">
              <Stars value={entry.rating} />
              {entry.worth_it !== null && <Badge color={entry.worth_it ? "green" : "orange"} variant="light">{entry.worth_it ? "worth it" : "not yet worth it"}</Badge>}
            </Group>
          </Stack>
        </Group>
        {entry.review ? (
          <Text style={{ whiteSpace: "pre-wrap" }}>{entry.review}</Text>
        ) : (
          <Text c="dimmed" size="sm">
            No review.
          </Text>
        )}
        <Anchor component={Link} to={`/items/${entry.item_id}`} size="sm">
          Open game
        </Anchor>
      </Stack>
    </Modal>
  );
}

export function JournalPage() {
  const categories = useCategories();
  const [year, setYear] = useState<number | null>(null);
  const [heatmapYear, setHeatmapYear] = useState<number | undefined>(undefined);
  const [category, setCategory] = useState<number | null>(null);
  const [device, setDevice] = useState<number | null>(null);
  const [ratingMin, setRatingMin] = useState<string | null>(null);
  const [mastered, setMastered] = useState(false);
  const [open, setOpen] = useState<JournalEntry | null>(null);
  const [importing, setImporting] = useState(false);
  const journal = useJournal({
    year: year ?? undefined,
    category: category ?? undefined,
    device: device ?? undefined,
    rating_min: ratingMin ? Number(ratingMin) : undefined,
    mastered: mastered || undefined,
  });
  const heatmap = useHeatmap(heatmapYear);

  return (
    <Stack>
      <PageHeader title="Journal">
        <Button variant="default" leftSection={<IconFileImport size={16} />} onClick={() => setImporting(true)}>
          Import finish dates
        </Button>
      </PageHeader>
      {importing && <FinishImportModal onClose={() => setImporting(false)} />}

      <QueryView query={heatmap}>
        {(h) => (
          <Card withBorder padding="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>
                {h.total} games finished in {h.year}
              </Text>
              <Select
                size="xs"
                w={110}
                data={[...new Set([new Date().getFullYear(), ...h.years_available])]
                  .sort((a, b) => b - a)
                  .map((y) => String(y))}
                value={String(h.year)}
                onChange={(v) => v && setHeatmapYear(Number(v))}
                allowDeselect={false}
              />
            </Group>
            <HeatmapCalendar
              heatmap={h}
              onDayClick={(date) => {
                setYear(Number(date.slice(0, 4)));
                document.getElementById(`month-${date.slice(0, 7)}`)?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          </Card>
        )}
      </QueryView>

      <Group wrap="wrap" align="flex-end">
        <Select
          label="Year"
          placeholder="All years"
          w={120}
          data={(heatmap.data?.years_available ?? []).map(String)}
          value={year ? String(year) : null}
          onChange={(v) => setYear(v ? Number(v) : null)}
          clearable
        />
        <Select
          label="Category"
          placeholder="All"
          w={180}
          data={(categories.data ?? []).filter((c) => c.type === "platform").map((c) => ({ value: String(c.id), label: c.name }))}
          value={category ? String(category) : null}
          onChange={(v) => setCategory(v ? Number(v) : null)}
          clearable
        />
        <div style={{ width: 220 }}>
          <DeviceSelect label="Device" value={device} onChange={setDevice} />
        </div>
        <Select
          label="Rating"
          placeholder="Any"
          w={110}
          data={["3", "3.5", "4", "4.5", "5"].map((v) => ({ value: v, label: `≥ ${v.replace(".", ",")} ★` }))}
          value={ratingMin}
          onChange={setRatingMin}
          clearable
        />
        <Checkbox label="100 % only" checked={mastered} onChange={(e) => setMastered(e.currentTarget.checked)} mb={8} />
      </Group>

      <QueryView query={journal}>
        {(data) =>
          !data.years.length && !data.unknown_date?.length ? (
            <Empty>No finished games yet. Mark a game as finished and it shows up here.</Empty>
          ) : (
            <Stack gap="xl">
              {data.years.map((y) => (
                <div key={y.year}>
                  <Group gap="lg" align="baseline" mb="sm">
                    <Title order={2}>{y.year}</Title>
                    <Text c="dimmed" size="sm">
                      {y.finished_count} finished · {hours(y.total_hours)}
                      {y.average_rating !== null && ` · Ø ${y.average_rating.toLocaleString("de-DE")} ★`}
                      {y.most_used_device && ` · mostly on ${y.most_used_device}`}
                    </Text>
                  </Group>
                  <Stack gap="md">
                    {y.months.map((m) => (
                      <div key={m.month} id={`month-${y.year}-${String(m.month).padStart(2, "0")}`}>
                        <Title order={5} mb="xs" c="dimmed">
                          {monthName(m.month)}
                        </Title>
                        <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 6, lg: 8 }}>
                          {m.entries.map((e) => (
                            <EntryCard key={e.completion_id} entry={e} onOpen={() => setOpen(e)} />
                          ))}
                        </SimpleGrid>
                      </div>
                    ))}
                  </Stack>
                </div>
              ))}
              {(data.unknown_date ?? []).length > 0 && (
                <div>
                  <Title order={3} mb="sm">
                    Date unknown
                  </Title>
                  <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 6, lg: 8 }}>
                    {(data.unknown_date ?? []).map((e) => (
                      <EntryCard key={e.completion_id} entry={e} onOpen={() => setOpen(e)} />
                    ))}
                  </SimpleGrid>
                </div>
              )}
            </Stack>
          )
        }
      </QueryView>
      {open && <EntryModal entry={open} onClose={() => setOpen(null)} />}
    </Stack>
  );
}
