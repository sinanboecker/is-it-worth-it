/** The sections of a game or device page: copies, devices & hours, DLC, completions, notes, wishlist, info. */
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconCheck, IconEdit, IconPackage, IconPlus, IconShoppingCart, IconTrash } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, unwrap } from "@/api/client";
import { useApiMutation, useCategories } from "@/api/queries";
import type { CompletionRead, CopyRead, DlcRead, ItemRead, PlayLinkIn, PlaySession } from "@/api/types";
import { confirmDelete, Empty, StatTile } from "@/components/common";
import { DateField, DeviceSelect, HoursInput, MoneyInput } from "@/components/inputs";
import { EditBundleModal } from "@/components/Bundles";
import { CopyModal } from "@/components/CopyModal";
import { DlcModal } from "@/components/ItemModals";
import { RawgAttribution } from "@/components/MetadataModals";
import { day, euros, hours, perHour } from "@/lib/format";
import { CONDITION, FORMAT } from "@/lib/labels";

export const patchItem = (id: number, body: Record<string, unknown>) =>
  unwrap(api.PATCH("/api/v1/items/{item_id}", { params: { path: { item_id: id } }, body }));

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{title}</Title>
        {action}
      </Group>
      {children}
    </Card>
  );
}

// --- copies -----------------------------------------------------------------------------------

export function CopiesSection({ item }: { item: ItemRead }) {
  const [editing, setEditing] = useState<CopyRead | "new" | null>(null);
  const [bundle, setBundle] = useState<number | null>(null);
  const remove = useApiMutation(
    (copy: CopyRead) =>
      unwrap(api.DELETE("/api/v1/items/{item_id}/copies/{copy_id}", { params: { path: { item_id: item.id, copy_id: copy.id } } })),
    { success: "Copy deleted" },
  );
  const c = item.copies_summary;
  return (
    <Section
      title={`Copies${c.copies_count ? ` (${c.owned_copies} owned${c.sold_copies ? `, ${c.sold_copies} sold` : ""})` : ""}`}
      action={
        <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setEditing("new")}>
          Add copy
        </Button>
      }
    >
      {item.copies.length ? (
        <ScrollArea>
          <Table verticalSpacing="xs" miw={650}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Bought</Table.Th>
                <Table.Th ta="right">Price</Table.Th>
                <Table.Th>Store</Table.Th>
                <Table.Th>Format</Table.Th>
                <Table.Th>Sold</Table.Th>
                <Table.Th>Note</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {item.copies.map((copy) => (
                <Table.Tr key={copy.id} opacity={copy.is_sold ? 0.6 : 1}>
                  <Table.Td>{copy.buy_date ? day(copy.buy_date) : "unknown"}</Table.Td>
                  <Table.Td ta="right">{euros(copy.buy_price_cents)}</Table.Td>
                  <Table.Td>{copy.store ?? "–"}</Table.Td>
                  <Table.Td>
                    {FORMAT[copy.format]}
                    {copy.condition && ` · ${CONDITION[copy.condition]}`}
                    {copy.won && (
                      <Badge ml={6} size="sm" variant="light" color="yellow" tt="none">
                        won
                      </Badge>
                    )}
                    {copy.traded && (
                      <Badge ml={6} size="sm" variant="light" color="cyan" tt="none">
                        traded
                      </Badge>
                    )}
                    {copy.backup && (
                      <Badge ml={6} size="sm" variant="light" color="grape" tt="none">
                        backup
                      </Badge>
                    )}
                    {copy.loaned && (
                      <Badge ml={6} size="sm" variant="light" color="orange" tt="none">
                        loaned
                      </Badge>
                    )}
                    {copy.bundle_id && (
                      <Button
                        size="compact-xs"
                        variant="light"
                        ml={6}
                        leftSection={<IconPackage size={12} />}
                        onClick={() => setBundle(copy.bundle_id)}
                      >
                        Bundle
                      </Button>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {copy.is_sold ? (
                      <Badge color="gray" variant="light">
                        {euros(copy.sell_price_cents)} · {day(copy.sell_date)}
                      </Badge>
                    ) : (
                      copy.days_owned !== null && (
                        <Text size="xs" c="dimmed">
                          owned {copy.days_owned} days
                        </Text>
                      )
                    )}
                  </Table.Td>
                  <Table.Td>{copy.note}</Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <ActionIcon variant="subtle" onClick={() => setEditing(copy)} aria-label="Edit copy">
                        <IconEdit size={16} />
                      </ActionIcon>
                      {!copy.bundle_id && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label="Delete copy"
                          onClick={() =>
                            confirmDelete("Delete this copy?", null, () => remove.mutate(copy))
                          }
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      ) : (
        <Empty>No copies yet.</Empty>
      )}
      {editing && (
        <CopyModal item={item} copy={editing === "new" ? undefined : editing} opened onClose={() => setEditing(null)} />
      )}
      {bundle !== null && <EditBundleModal bundleId={bundle} onClose={() => setBundle(null)} />}
    </Section>
  );
}

// --- devices & hours --------------------------------------------------------------------------

export function DevicesSection({ game }: { game: ItemRead }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<PlayLinkIn[]>([]);
  const save = useApiMutation(
    () =>
      unwrap(api.PUT("/api/v1/items/{item_id}/play-links", { params: { path: { item_id: game.id } }, body: rows })),
    { success: "Devices saved", onSuccess: () => setEditing(false) },
  );
  const start = () => {
    setRows(game.devices.map((d) => ({ hardware_id: d.hardware_id, hours: d.hours, emulated: d.emulated })));
    setEditing(true);
  };
  const update = (index: number, patch: Partial<PlayLinkIn>) =>
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const total = (editing ? rows : game.devices).reduce((sum, r) => sum + (r.hours ?? 0), 0);

  return (
    <Section
      title="Devices & hours"
      action={
        !editing && (
          <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={start}>
            Edit
          </Button>
        )
      }
    >
      {editing ? (
        <Stack gap="xs">
          {rows.map((row, index) => (
            <Group key={index} align="flex-end" wrap="nowrap">
              <div style={{ flex: 1 }}>
                <DeviceSelect
                  label={index === 0 ? "Device" : undefined}
                  value={row.hardware_id}
                  onChange={(v) => v && update(index, { hardware_id: v, emulated: null })}
                  exclude={rows.map((r) => r.hardware_id)}
                  clearable={false}
                />
              </div>
              <HoursInput label={index === 0 ? "Hours" : undefined} w={120} value={row.hours ?? 0} onChange={(h) => update(index, { hours: h })} />
              <Checkbox
                label="emulated"
                mb={8}
                checked={row.emulated ?? false}
                indeterminate={row.emulated === null || row.emulated === undefined}
                onChange={(e) => update(index, { emulated: e.currentTarget.checked })}
              />
              <ActionIcon variant="subtle" color="red" mb={4} onClick={() => setRows((rs) => rs.filter((_, i) => i !== index))} aria-label="Remove device">
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
          <AddDeviceRow onAdd={(id) => setRows((rs) => [...rs, { hardware_id: id, hours: 0, emulated: null }])} exclude={rows.map((r) => r.hardware_id)} />
          <Text size="sm">Total: {hours(total)}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      ) : game.devices.length ? (
        <Table>
          <Table.Tbody>
            {game.devices.map((d) => (
              <Table.Tr key={d.hardware_id}>
                <Table.Td>
                  <Anchor component={Link} to={`/items/${d.hardware_id}`}>
                    {d.hardware_name}
                  </Anchor>
                  {d.emulated && <Badge ml="xs" size="sm" variant="light">🕹 emulated</Badge>}
                </Table.Td>
                <Table.Td ta="right">{hours(d.hours)}</Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr>
              <Table.Td fw={600}>Total</Table.Td>
              <Table.Td ta="right" fw={600}>
                {hours(total)}
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      ) : (
        <Empty>No device yet. Add the device(s) you played on.</Empty>
      )}
    </Section>
  );
}

function AddDeviceRow({ onAdd, exclude }: { onAdd: (id: number) => void; exclude: number[] }) {
  return (
    <DeviceSelect key={exclude.join(",")} label="Add device" value={null} onChange={(id) => id && onAdd(id)} exclude={exclude} />
  );
}

// --- DLC --------------------------------------------------------------------------------------

// --- play sessions ----------------------------------------------------------------------------

function SessionModal({ game, play, onClose }: { game: ItemRead; play: PlaySession; onClose: () => void }) {
  const [playedOn, setPlayedOn] = useState<string | null>(play.played_on);
  const [device, setDevice] = useState<number | null>(play.hardware_id);
  const [amount, setAmount] = useState(play.hours);
  const save = useApiMutation(
    () =>
      unwrap(
        api.PATCH("/api/v1/sessions/{session_id}", {
          params: { path: { session_id: play.id } },
          body: { played_on: playedOn, hardware_id: device, hours: amount },
        }),
      ),
    { success: "Session saved", onSuccess: onClose },
  );
  return (
    <Modal opened onClose={onClose} title={`Edit session – ${game.name}`}>
      <Stack>
        <DateField label="Played on" value={playedOn} onChange={setPlayedOn} required />
        <DeviceSelect value={device} onChange={setDevice} required clearable={false} />
        <HoursInput label="Hours played" value={amount} onChange={setAmount} required />
        <Text size="xs" c="dimmed">
          The device's total hours change with the session.
        </Text>
        <Group justify="flex-end">
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!playedOn || !device || amount <= 0}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** When the game was played (optional: each "+ hours" logs a session); hours without one are listed below. */
export function SessionsSection({ game }: { game: ItemRead }) {
  const [editing, setEditing] = useState<PlaySession | null>(null);
  const remove = useApiMutation(
    (play: PlaySession) => unwrap(api.DELETE("/api/v1/sessions/{session_id}", { params: { path: { session_id: play.id } } })),
    { success: "Session deleted" },
  );
  return (
    <Section title={`Sessions · ${game.sessions.length}`}>
      <ScrollArea.Autosize mah={320}>
        <Table>
          <Table.Tbody>
            {game.sessions.map((play) => (
              <Table.Tr key={play.id}>
                <Table.Td>{day(play.played_on)}</Table.Td>
                <Table.Td>{play.hardware_name}</Table.Td>
                <Table.Td ta="right">{hours(play.hours)}</Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <ActionIcon variant="subtle" onClick={() => setEditing(play)} aria-label={`Edit session of ${day(play.played_on)}`}>
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() =>
                        confirmDelete(
                          `Delete the session of ${day(play.played_on)}?`,
                          `Its ${hours(play.hours)} are taken off ${play.hardware_name}'s total.`,
                          () => remove.mutate(play),
                        )
                      }
                      aria-label={`Delete session of ${day(play.played_on)}`}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
      {game.unlogged_hours > 0 && (
        <Text size="xs" c="dimmed" mt="xs">
          {hours(game.unlogged_hours)} without a session (logged before, or set in Devices &amp; hours)
        </Text>
      )}
      {editing && <SessionModal game={game} play={editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

export function DlcSection({ game }: { game: ItemRead }) {
  const [editing, setEditing] = useState<DlcRead | "new" | null>(null);
  const remove = useApiMutation(
    (dlc: DlcRead) =>
      unwrap(api.DELETE("/api/v1/items/{item_id}/dlc/{dlc_id}", { params: { path: { item_id: game.id, dlc_id: dlc.id } } })),
    { success: "DLC deleted" },
  );
  return (
    <Section
      title={`DLC${game.dlcs.length ? ` · ${euros(game.value?.dlc_cost_cents)}` : ""}`}
      action={
        <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setEditing("new")} disabled={game.status === "wishlist"}>
          Add DLC
        </Button>
      }
    >
      {game.dlcs.length ? (
        <Table>
          <Table.Tbody>
            {game.dlcs.map((dlc) => (
              <Table.Tr key={dlc.id}>
                <Table.Td>{dlc.name}</Table.Td>
                <Table.Td>{day(dlc.buy_date)}</Table.Td>
                <Table.Td>{dlc.store}</Table.Td>
                <Table.Td ta="right">{euros(dlc.price_cents)}</Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <ActionIcon variant="subtle" onClick={() => setEditing(dlc)} aria-label="Edit DLC">
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => remove.mutate(dlc)} aria-label="Delete DLC">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Empty>No DLC.</Empty>
      )}
      {editing && <DlcModal game={game} dlc={editing === "new" ? undefined : editing} opened onClose={() => setEditing(null)} />}
    </Section>
  );
}

// --- completions ------------------------------------------------------------------------------

function CompletionEditModal({ game, completion, onClose }: { game: ItemRead; completion: CompletionRead; onClose: () => void }) {
  const [finishedOn, setFinishedOn] = useState(completion.finished_on);
  const [startedOn, setStartedOn] = useState(completion.started_on);
  const [device, setDevice] = useState(completion.hardware_id);
  const [review, setReview] = useState(completion.review ?? "");
  const save = useApiMutation(
    () =>
      unwrap(
        api.PATCH("/api/v1/items/{item_id}/completions/{completion_id}", {
          params: { path: { item_id: game.id, completion_id: completion.id } },
          body: { finished_on: finishedOn, started_on: startedOn, hardware_id: device, review: review || null },
        }),
      ),
    { success: "Saved", onSuccess: onClose },
  );
  return (
    <Modal opened onClose={onClose} title="Edit finish">
      <Stack>
        <Group grow>
          <DateField label="Started on" value={startedOn} onChange={setStartedOn} clearable />
          <DateField label="Finished on" value={finishedOn} onChange={setFinishedOn} clearable placeholder="unknown" />
        </Group>
        <DeviceSelect value={device} onChange={setDevice} />
        <Textarea label="Review" autosize minRows={2} value={review} onChange={(e) => setReview(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function CompletionsSection({ game, onFinish }: { game: ItemRead; onFinish: () => void }) {
  const [editing, setEditing] = useState<CompletionRead | null>(null);
  const remove = useApiMutation(
    (c: CompletionRead) =>
      unwrap(
        api.DELETE("/api/v1/items/{item_id}/completions/{completion_id}", {
          params: { path: { item_id: game.id, completion_id: c.id } },
        }),
      ),
    { success: "Finish removed" },
  );
  return (
    <Section
      title="Finished"
      action={
        <Button size="xs" variant="light" color="green" leftSection={<IconCheck size={14} />} onClick={onFinish} disabled={game.status === "wishlist"}>
          Finished today
        </Button>
      }
    >
      {game.completions.length ? (
        <Stack gap="xs">
          {game.completions.map((c) => (
            <Group key={c.id} justify="space-between" wrap="nowrap" align="flex-start">
              <div>
                <Text size="sm" fw={500}>
                  {c.finished_on ? day(c.finished_on) : "Date unknown"}
                  {c.started_on && (
                    <Text span size="xs" c="dimmed">
                      {" "}
                      (started {day(c.started_on)})
                    </Text>
                  )}
                  {c.hardware_name && ` · ${c.hardware_name}`}
                </Text>
                {c.review && (
                  <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
                    {c.review}
                  </Text>
                )}
              </div>
              <Group gap={4} wrap="nowrap">
                <ActionIcon variant="subtle" onClick={() => setEditing(c)} aria-label="Edit finish">
                  <IconEdit size={16} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" onClick={() => remove.mutate(c)} aria-label="Delete finish">
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      ) : (
        <Empty>Not finished yet.</Empty>
      )}
      {editing && <CompletionEditModal game={game} completion={editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

// --- header, notes, wishlist ------------------------------------------------------------------

export function EditItemModal({ item, onClose }: { item: ItemRead; onClose: () => void }) {
  const categories = useCategories();
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(String(item.category_id));
  const save = useApiMutation(() => patchItem(item.id, { name, category_id: Number(category) }), {
    success: "Saved",
    onSuccess: onClose,
  });
  const allowed = (categories.data ?? []).filter((c) => item.kind === "hardware" || c.type === "platform");
  return (
    <Modal opened onClose={onClose} title="Edit">
      <Stack>
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <Select label="Category" data={allowed.map((c) => ({ value: String(c.id), label: c.name }))} value={category} onChange={(v) => v && setCategory(v)} allowDeselect={false} />
        <Group justify="flex-end">
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!name.trim()}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function NotesSection({ item }: { item: ItemRead }) {
  const [notes, setNotes] = useState(item.notes ?? "");
  const save = useApiMutation(() => patchItem(item.id, { notes: notes || null }), { success: "Notes saved" });
  return (
    <Section title="Notes">
      <Textarea autosize minRows={2} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
      {notes !== (item.notes ?? "") && (
        <Group justify="flex-end" mt="xs">
          <Button size="xs" onClick={() => save.mutate(undefined)} loading={save.isPending}>
            Save notes
          </Button>
        </Group>
      )}
    </Section>
  );
}

export function WishlistSection({ game, onBought }: { game: ItemRead; onBought: () => void }) {
  const [target, setTarget] = useState(game.target_price_cents);
  const save = useApiMutation(() => patchItem(game.id, { target_price_cents: target }), { success: "Target price saved" });
  return (
    <Section title="Wishlist">
      <Stack>
        <Text size="sm" c="dimmed">
          Prices from gg.deals (official stores and keyshops) will appear here once the gg.deals milestone is done.
        </Text>
        <Group align="flex-end">
          <MoneyInput label="Target price" value={target} onChange={setTarget} w={180} />
          <Button variant="light" onClick={() => save.mutate(undefined)} disabled={target === game.target_price_cents}>
            Save
          </Button>
          <Button leftSection={<IconShoppingCart size={16} />} onClick={onBought}>
            Bought it
          </Button>
        </Group>
      </Stack>
    </Section>
  );
}

export function ValueTiles({ item }: { item: ItemRead }) {
  const v = item.value;
  if (!v) return null;
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
      <StatTile label={item.kind === "game" ? "Total paid" : "Paid"} value={euros(v.total_paid_cents)} hint={v.dlc_cost_cents ? `incl. ${euros(v.dlc_cost_cents)} DLC` : undefined} />
      <StatTile label="Net cost" value={euros(v.net_cost_cents)} hint={item.copies_summary.copies_received_cents ? `${euros(item.copies_summary.copies_received_cents)} back from sales` : undefined} />
      <StatTile label="Hours" value={hours(v.hours)} />
      <StatTile label="Cost per hour" value={perHour(v.cost_per_hour_cents)} hint={`break-even ${perHour(v.threshold_cph)}`} />
      <StatTile
        label="Worth it?"
        value={v.worth_it ? "Yes ✔" : `${hours(v.hours_to_break_even)} left`}
        hint={item.worth_it_since ? `since ${day(item.worth_it_since)}` : item.worth_it_before_logging ? "before sessions were logged" : undefined}
      />
      {item.kind === "game" ? (
        <StatTile label="Finished" value={`${v.times_finished}×`} hint={v.last_finished_on ? `last ${day(v.last_finished_on)}` : undefined} />
      ) : (
        <StatTile label="Games played" value={v.games_played_on} hint={v.emulated_games ? `${v.emulated_games} emulated` : undefined} />
      )}
    </SimpleGrid>
  );
}

export function PlayedGames({ item }: { item: ItemRead }) {
  return (
    <Section title="Games played on this device">
      {item.played_games.some((g) => g.hours > 0) ? (
        <Table>
          <Table.Tbody>
            {item.played_games
              .filter((g) => g.hours > 0)
              .sort((a, b) => b.hours - a.hours)
              .map((g) => (
                <Table.Tr key={g.hardware_id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/items/${g.hardware_id}`}>
                      {g.hardware_name}
                    </Anchor>
                    {g.emulated && <Badge ml="xs" size="sm" variant="light">🕹 emulated</Badge>}
                  </Table.Td>
                  <Table.Td ta="right">{hours(g.hours)}</Table.Td>
                </Table.Tr>
              ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Empty>No games played on this device yet.</Empty>
      )}
    </Section>
  );
}

export function AboutSection({ game, onChangeMatch }: { game: ItemRead; onChangeMatch: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const facts = [
    game.release_date && `Released ${day(game.release_date)}`,
    game.genres,
    game.developer,
  ].filter(Boolean);
  return (
    <Section
      title="About"
      action={
        <Button size="xs" variant="subtle" onClick={onChangeMatch}>
          Change match
        </Button>
      }
    >
      <Stack gap="xs">
        {facts.length > 0 && <Text size="sm">{facts.join(" · ")}</Text>}
        {game.summary && (
          <div>
            <Text size="sm" c="dimmed" lineClamp={expanded ? undefined : 4} style={{ whiteSpace: "pre-line" }}>
              {game.summary}
            </Text>
            {game.summary.length > 300 && (
              <Anchor size="sm" component="button" onClick={() => setExpanded((e) => !e)}>
                {expanded ? "Less" : "More"}
              </Anchor>
            )}
          </div>
        )}
        <Group justify="space-between">
          <RawgAttribution />
          {game.rawg_slug && (
            <Anchor href={`https://rawg.io/games/${game.rawg_slug}`} target="_blank" rel="noreferrer" size="xs">
              View on RAWG
            </Anchor>
          )}
        </Group>
      </Stack>
    </Section>
  );
}
