import {
  Anchor,
  Badge,
  Button,
  Card,
  Collapse,
  Group,
  Modal,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp, IconFileImport } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useCategories, useJournal } from "@/api/queries";
import type { Category, Journal, JournalEntry } from "@/api/types";
import { Cover, Empty, Figure, PageHeader, QueryView } from "@/components/common";
import { FinishImportModal } from "@/components/FinishImportModal";
import { DeviceSelect, Stars } from "@/components/inputs";
import { day, hours, monthName, perHour } from "@/lib/format";
import { allEntries, journalTotals } from "@/lib/journal";

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

/** A label, a bar for its share of the largest value, and the value. */
function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Text size="sm" w={150} lineClamp={1} title={label}>
        {label}
      </Text>
      <Progress value={max ? (value / max) * 100 : 0} style={{ flex: 1 }} aria-hidden />
      <Text size="sm" w={36} ta="right" fw={600}>
        {value}
      </Text>
    </Group>
  );
}

/** Totals of all finished games (not affected by the filters below). */
function JournalTotalsCard({ journal, categories }: { journal: Journal; categories: Category[] }) {
  const t = journalTotals(journal);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const maxCategory = Math.max(0, ...t.perCategory.map((c) => c.games));
  const stars = [5, 4, 3, 2, 1] as const;
  const maxStars = Math.max(0, ...stars.map((s) => t.ratingCounts[s]));
  // per-browser convenience: whether the lists below the figures are shown
  const [open, setOpen] = useLocalStorage({ key: "journal-totals-open", defaultValue: true, getInitialValueInEffect: false });
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>All finished games</Title>
        <Button
          size="xs"
          variant="subtle"
          rightSection={open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "Hide details" : "Categories & ratings"}
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 3 }}>
        <Figure
          label="Games finished"
          value={String(t.games)}
          hint={t.finishes > t.games ? `${t.finishes} finishes incl. replays` : undefined}
        />
        <Figure label="Total hours" value={hours(t.hours)} />
        <Figure
          label="Average rating"
          value={t.averageRating === null ? "–" : `${t.averageRating.toLocaleString("de-DE")} ★`}
          hint={`${t.rated} of ${t.games} games rated`}
        />
      </SimpleGrid>
      <Collapse in={open}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl" mt="md">
          <Stack gap={6}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Games per category
            </Text>
            {t.perCategory.map((c) => (
              <BarRow key={c.categoryId} label={names.get(c.categoryId) ?? "?"} value={c.games} max={maxCategory} />
            ))}
          </Stack>
          <Stack gap={6}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Ratings
            </Text>
            {t.rated ? (
              stars.map((s) => <BarRow key={s} label={`${"★".repeat(s)}${"☆".repeat(5 - s)}`} value={t.ratingCounts[s]} max={maxStars} />)
            ) : (
              <Text size="sm" c="dimmed">
                No ratings yet.
              </Text>
            )}
          </Stack>
        </SimpleGrid>
      </Collapse>
    </Card>
  );
}

export function JournalPage() {
  const categories = useCategories();
  const [year, setYear] = useState<number | null>(null);
  const [category, setCategory] = useState<number | null>(null);
  const [device, setDevice] = useState<number | null>(null);
  const [ratingMin, setRatingMin] = useState<string | null>(null);
  const [open, setOpen] = useState<JournalEntry | null>(null);
  const [importing, setImporting] = useState(false);
  const journal = useJournal({
    year: year ?? undefined,
    category: category ?? undefined,
    device: device ?? undefined,
    rating_min: ratingMin ? Number(ratingMin) : undefined,
  });
  const all = useJournal({}); // for the totals and the years to filter by

  return (
    <Stack>
      <PageHeader title="Journal">
        <Button variant="default" leftSection={<IconFileImport size={16} />} onClick={() => setImporting(true)}>
          Import finish dates
        </Button>
      </PageHeader>
      {importing && <FinishImportModal onClose={() => setImporting(false)} />}

      <QueryView query={all}>
        {(data) => (allEntries(data).length ? <JournalTotalsCard journal={data} categories={categories.data ?? []} /> : null)}
      </QueryView>

      <Group wrap="wrap" align="flex-end">
        <Select
          label="Year"
          placeholder="All years"
          w={120}
          data={(all.data?.years ?? []).map((y) => String(y.year))}
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
