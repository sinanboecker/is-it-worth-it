import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Menu,
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
import {
  IconCheck,
  IconDots,
  IconEdit,
  IconPackage,
  IconPhoto,
  IconPhotoOff,
  IconPlus,
  IconSearch,
  IconShoppingCart,
  IconTrash,
  IconUnlink,
} from "@tabler/icons-react";
import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, unwrap, upload } from "@/api/client";
import { useApiMutation, useCategories, useItem } from "@/api/queries";
import type { CompletionRead, CopyRead, DlcRead, GameStatus, ItemRead, PlayLinkIn } from "@/api/types";
import { CopyBadges, StatusBadge, WorthItBadge } from "@/components/badges";
import { confirmDelete, Cover, Empty, imageOf, QueryView, StatTile } from "@/components/common";
import { DateField, DeviceSelect, FavoriteHeart, HoursInput, MoneyInput, Stars, StatusSelect } from "@/components/inputs";
import { EditBundleModal } from "@/components/Bundles";
import { AddHoursModal, CopyModal, DlcModal, FinishModal } from "@/components/ItemModals";
import { MetadataSearchModal, RawgAttribution } from "@/components/MetadataModals";
import { day, euros, hours, perHour } from "@/lib/format";
import { CONDITION, FORMAT } from "@/lib/labels";

const patchItem = (id: number, body: Record<string, unknown>) =>
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

function CopiesSection({ item }: { item: ItemRead }) {
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

function DevicesSection({ game }: { game: ItemRead }) {
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

function DlcSection({ game }: { game: ItemRead }) {
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
  const [mastered, setMastered] = useState(completion.mastered);
  const [review, setReview] = useState(completion.review ?? "");
  const save = useApiMutation(
    () =>
      unwrap(
        api.PATCH("/api/v1/items/{item_id}/completions/{completion_id}", {
          params: { path: { item_id: game.id, completion_id: completion.id } },
          body: { finished_on: finishedOn, started_on: startedOn, hardware_id: device, mastered, review: review || null },
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
        <Checkbox label="100 % / mastered" checked={mastered} onChange={(e) => setMastered(e.currentTarget.checked)} />
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

function CompletionsSection({ game, onFinish }: { game: ItemRead; onFinish: () => void }) {
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
                  {c.mastered && (
                    <Badge ml="xs" size="sm" color="yellow">
                      100 %
                    </Badge>
                  )}
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

function EditItemModal({ item, onClose }: { item: ItemRead; onClose: () => void }) {
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

function NotesSection({ item }: { item: ItemRead }) {
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

function WishlistSection({ game, onBought }: { game: ItemRead; onBought: () => void }) {
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

function ValueTiles({ item }: { item: ItemRead }) {
  const v = item.value;
  if (!v) return null;
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
      <StatTile label={item.kind === "game" ? "Total paid" : "Paid"} value={euros(v.total_paid_cents)} hint={v.dlc_cost_cents ? `incl. ${euros(v.dlc_cost_cents)} DLC` : undefined} />
      <StatTile label="Net cost" value={euros(v.net_cost_cents)} hint={item.copies_summary.copies_received_cents ? `${euros(item.copies_summary.copies_received_cents)} back from sales` : undefined} />
      <StatTile label="Hours" value={hours(v.hours)} />
      <StatTile label="Cost per hour" value={perHour(v.cost_per_hour_cents)} hint={`break-even ${perHour(v.threshold_cph)}`} />
      <StatTile label="Worth it?" value={v.worth_it ? "Yes ✔" : `${hours(v.hours_to_break_even)} left`} />
      {item.kind === "game" ? (
        <StatTile label="Finished" value={`${v.times_finished}×`} hint={v.last_finished_on ? `last ${day(v.last_finished_on)}` : undefined} />
      ) : (
        <StatTile label="Games played" value={v.games_played_on} hint={v.emulated_games ? `${v.emulated_games} emulated` : undefined} />
      )}
    </SimpleGrid>
  );
}

function PlayedGames({ item }: { item: ItemRead }) {
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

function AboutSection({ game, onChangeMatch }: { game: ItemRead; onChangeMatch: () => void }) {
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

function ItemView({ item }: { item: ItemRead }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const fileInput = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<"hours" | "finish" | "edit" | "copy" | "metadata" | null>(null);
  const unlink = useApiMutation(
    () => unwrap(api.DELETE("/api/v1/items/{item_id}/metadata", { params: { path: { item_id: item.id } } })),
    { success: "Unlinked from RAWG" },
  );
  const uploadImage = useApiMutation(
    (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return upload<ItemRead>(`/api/v1/items/${item.id}/image`, form);
    },
    { success: "Image saved" },
  );
  const removeImage = useApiMutation(
    () => unwrap(api.DELETE("/api/v1/items/{item_id}/image", { params: { path: { item_id: item.id } } })),
    { success: "Own image removed" },
  );
  const setStatus = useApiMutation((status: GameStatus) => patchItem(item.id, { status }), { success: "Status changed" });
  const setRating = useApiMutation((rating: number | null) => patchItem(item.id, { rating }), {});
  const setFavorite = useApiMutation((favorite: boolean) => patchItem(item.id, { favorite }), {
    success: (updated) => (updated.favorite ? `${updated.name} is a favorite ❤` : `${updated.name} removed from favorites`),
  });
  const remove = useApiMutation(
    () => unwrap(api.DELETE("/api/v1/items/{item_id}", { params: { path: { item_id: item.id } } })),
    { success: `${item.name} deleted`, onSuccess: () => navigate(`/categories/${item.category_id}`) },
  );
  const category = categories.data?.find((c) => c.id === item.category_id);
  const isGame = item.kind === "game";
  const wishlist = item.status === "wishlist";

  return (
    <Stack>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) uploadImage.mutate(file);
          e.currentTarget.value = "";
        }}
      />
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Group align="flex-start" wrap="wrap">
          <Cover name={item.name} path={imageOf(item)} width={280} />
          <Stack gap={6}>
            <Title order={2}>{item.name}</Title>
            <Group gap="xs">
              {category && (
                <Anchor component={Link} to={`/categories/${category.id}`} size="sm">
                  {category.name}
                </Anchor>
              )}
              <StatusBadge status={item.status} />
              <WorthItBadge value={item.value} />
              <CopyBadges item={item} />
            </Group>
            {isGame && (
              <Group gap={6}>
                {!wishlist && <Stars value={item.rating} onChange={(r) => setRating.mutate(r)} size="md" />}
                <FavoriteHeart value={item.favorite} onChange={(f) => setFavorite.mutate(f)} />
              </Group>
            )}
          </Stack>
        </Group>
        <Group gap="xs">
          {isGame && !item.rawg_id && (
            <Button variant="light" leftSection={<IconSearch size={16} />} onClick={() => setModal("metadata")}>
              Find info
            </Button>
          )}
          {isGame && !wishlist && (
            <>
              <Button leftSection={<IconPlus size={16} />} onClick={() => setModal("hours")}>
                Hours
              </Button>
              <Button variant="light" color="green" leftSection={<IconCheck size={16} />} onClick={() => setModal("finish")}>
                Finished
              </Button>
            </>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="More">
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => setModal("edit")}>
                Rename / move
              </Menu.Item>
              {isGame && (
                <Menu.Item leftSection={<IconSearch size={14} />} onClick={() => setModal("metadata")}>
                  {item.rawg_id ? "Change RAWG match" : "Find info on RAWG"}
                </Menu.Item>
              )}
              {item.rawg_id && (
                <Menu.Item leftSection={<IconUnlink size={14} />} onClick={() => unlink.mutate(undefined)}>
                  Unlink from RAWG
                </Menu.Item>
              )}
              <Menu.Item leftSection={<IconPhoto size={14} />} onClick={() => fileInput.current?.click()}>
                Upload own image
              </Menu.Item>
              {item.image_path && (
                <Menu.Item leftSection={<IconPhotoOff size={14} />} onClick={() => removeImage.mutate(undefined)}>
                  Remove own image
                </Menu.Item>
              )}
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() =>
                  confirmDelete(`Delete ${item.name}?`, "Copies, hours, DLC and finishes are deleted too.", () => remove.mutate(undefined))
                }
              >
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      {isGame && !wishlist && (
        <Group>
          <StatusSelect
            value={item.status}
            onChange={(s) => (s === "finished" ? setModal("finish") : setStatus.mutate(s))}
            allowWishlist={false}
          />
        </Group>
      )}

      <ValueTiles item={item} />
      {isGame && (item.rawg_id || item.summary) && <AboutSection game={item} onChangeMatch={() => setModal("metadata")} />}

      {wishlist ? (
        <WishlistSection game={item} onBought={() => setModal("copy")} />
      ) : (
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          {isGame && <DevicesSection game={item} />}
          {isGame && <CompletionsSection game={item} onFinish={() => setModal("finish")} />}
          {!isGame && <PlayedGames item={item} />}
          {isGame && <DlcSection game={item} />}
        </SimpleGrid>
      )}
      {!wishlist && <CopiesSection item={item} />}
      <NotesSection key={item.notes ?? ""} item={item} />

      {modal === "hours" && <AddHoursModal game={item} opened onClose={() => setModal(null)} />}
      {modal === "finish" && <FinishModal game={item} opened onClose={() => setModal(null)} />}
      {modal === "edit" && <EditItemModal item={item} onClose={() => setModal(null)} />}
      {modal === "copy" && <CopyModal item={item} opened onClose={() => setModal(null)} />}
      {modal === "metadata" && <MetadataSearchModal game={item} onClose={() => setModal(null)} />}
    </Stack>
  );
}

export function ItemPage() {
  const id = Number(useParams().id);
  const query = useItem(id);
  return <QueryView query={query}>{(item) => <ItemView key={item.id} item={item} />}</QueryView>;
}
