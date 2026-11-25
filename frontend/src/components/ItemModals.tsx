/** Dialogs to change a game or device: add hours, finish, copies, DLC, new item. */
import {
  Autocomplete,
  Button,
  Checkbox,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { api, unwrap } from "@/api/client";
import { useApiMutation, useCategories, useDlcSuggestions, useMetadataStatus, useRawgSearch, useSettings } from "@/api/queries";
import type {
  Candidate,
  CopyFormat,
  DlcRead,
  GameStatus,
  ItemKind,
  ItemRead,
  ItemSummary,
  SplitMode,
} from "@/api/types";
import { euros, todayIso } from "@/lib/format";
import { STATUS } from "@/lib/labels";
import type { ModalProps } from "./common";
import { DateField, DeviceSelect, HoursInput, MoneyInput, Stars, StatusSelect, StoreInput } from "./inputs";
import { BundleEntriesEditor, emptyEntry, entryBody, entryComplete, useSplitPreview, type BundleEntryDraft } from "./Bundles";
import { CandidateRow, RawgAttribution } from "./MetadataModals";
import { CopyFields, copyBody, emptyCopy, type CopyDraft } from "./CopyModal";

/** Device the user played last on (pre-selected for "+ hours" and "Finished"). */
export function lastUsedDevice(item: ItemSummary): number | null {
  const devices = [...item.devices].sort((a, b) =>
    (b.last_played_at ?? "").localeCompare(a.last_played_at ?? "") || b.hours - a.hours,
  );
  return devices[0]?.hardware_id ?? null;
}

const setStatus = (id: number, status: GameStatus) =>
  unwrap(api.PATCH("/api/v1/items/{item_id}", { params: { path: { item_id: id } }, body: { status } }));

// --- hours ------------------------------------------------------------------------------------

export function AddHoursModal({ game, opened, onClose }: ModalProps & { game: ItemSummary }) {
  const [device, setDevice] = useState<number | null>(lastUsedDevice(game));
  const [amount, setAmount] = useState(1);
  const [playedOn, setPlayedOn] = useState<string | null>(todayIso());
  const [logSession, setLogSession] = useState(true); // unticked: only add to the device's total, as before sessions
  const switchStatus = useApiMutation((status: GameStatus) => setStatus(game.id, status), {
    success: "Status changed",
  });
  const mutation = useApiMutation(
    () =>
      unwrap(
        api.POST("/api/v1/items/{item_id}/hours", {
          params: { path: { item_id: game.id } },
          body: { hours: amount, hardware_id: device, played_on: playedOn, log_session: logSession },
        }),
      ),
    {
      success: `${amount.toLocaleString("de-DE")} h added to ${game.name}`,
      onSuccess: (result) => {
        onClose();
        const suggested = result.suggested_status;
        if (suggested) {
          modals.openConfirmModal({
            title: `Set ${game.name} to "${STATUS[suggested].label}"?`,
            labels: { confirm: "Yes", cancel: "No" },
            onConfirm: () => switchStatus.mutate(suggested),
          });
        }
      },
    },
  );
  return (
    <Modal opened={opened} onClose={onClose} title={`Add hours – ${game.name}`}>
      <Stack>
        <HoursInput label="Hours played" value={amount} onChange={setAmount} data-autofocus required />
        <DeviceSelect value={device} onChange={setDevice} required clearable={false} />
        <DateField label="Played on" value={playedOn} onChange={setPlayedOn} />
        <Checkbox
          label="Log as a session"
          description="Keeps the date, for hours per week and year. Unticked, the hours only go into the total."
          checked={logSession}
          onChange={(e) => setLogSession(e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <Button onClick={() => mutation.mutate(undefined)} loading={mutation.isPending} disabled={!device || amount <= 0}>
            Add
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// --- finish -----------------------------------------------------------------------------------

export function FinishModal({ game, opened, onClose }: ModalProps & { game: ItemSummary }) {
  const [finishedOn, setFinishedOn] = useState<string | null>(todayIso());
  const [unknownDate, setUnknownDate] = useState(false);
  const [device, setDevice] = useState<number | null>(lastUsedDevice(game));
  const [review, setReview] = useState("");
  const [rating, setRating] = useState<number | null>(game.rating);
  const mutation = useApiMutation(
    async () => {
      await unwrap(
        api.POST("/api/v1/items/{item_id}/completions", {
          params: { path: { item_id: game.id } },
          body: {
            finished_on: unknownDate ? null : finishedOn,
            hardware_id: device,
            review: review.trim() || null,
          },
        }),
      );
      if (rating !== game.rating) {
        await unwrap(
          api.PATCH("/api/v1/items/{item_id}", { params: { path: { item_id: game.id } }, body: { rating } }),
        );
      }
    },
    { success: `${game.name} finished 🎉`, onSuccess: onClose },
  );
  return (
    <Modal opened={opened} onClose={onClose} title={`Finished – ${game.name}`}>
      <Stack>
        <DateField label="Finished on" value={finishedOn} onChange={setFinishedOn} disabled={unknownDate} />
        <Checkbox label="Date unknown" checked={unknownDate} onChange={(e) => setUnknownDate(e.currentTarget.checked)} />
        <DeviceSelect label="Finished on device" value={device} onChange={setDevice} />
        <Textarea label="Review" placeholder="What did you think of this playthrough?" autosize minRows={2} value={review} onChange={(e) => setReview(e.currentTarget.value)} />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Game rating
          </Text>
          <Stars value={rating} onChange={setRating} size="md" />
        </div>
        <Group justify="flex-end">
          <Button onClick={() => mutation.mutate(undefined)} loading={mutation.isPending} disabled={!unknownDate && !finishedOn}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// --- DLC --------------------------------------------------------------------------------------

export function DlcModal({ game, dlc, opened, onClose }: ModalProps & { game: ItemRead; dlc?: DlcRead }) {
  const [name, setName] = useState(dlc?.name ?? "");
  const [buyDate, setBuyDate] = useState<string | null>(dlc?.buy_date ?? todayIso());
  const [price, setPrice] = useState<number | null>(dlc?.price_cents ?? null);
  const [store, setStore] = useState<string | null>(dlc?.store ?? null);
  const [ids, setIds] = useState({ steam_app_id: dlc?.steam_app_id ?? null, rawg_id: dlc?.rawg_id ?? null });
  const suggestions = useDlcSuggestions(game.id, !dlc);
  const pickSuggestion = (value: string) => {
    const s = suggestions.data?.find((d) => d.name === value);
    if (!s) return;
    setIds({ steam_app_id: s.steam_app_id ?? null, rawg_id: s.rawg_id ?? null });
    if (s.price_cents !== null && s.price_cents !== undefined && (!s.currency || s.currency === "EUR")) setPrice(s.price_cents);
    if (s.source === "steam" && !store) setStore("Steam");
  };
  const mutation = useApiMutation(
    () => {
      const body = { name, buy_date: buyDate!, price_cents: price!, store, ...ids };
      return dlc
        ? unwrap(api.PATCH("/api/v1/items/{item_id}/dlc/{dlc_id}", { params: { path: { item_id: game.id, dlc_id: dlc.id } }, body }))
        : unwrap(api.POST("/api/v1/items/{item_id}/dlc", { params: { path: { item_id: game.id } }, body }));
    },
    { success: dlc ? "DLC saved" : "DLC added", onSuccess: onClose },
  );
  return (
    <Modal opened={opened} onClose={onClose} title={dlc ? "Edit DLC" : `Add DLC – ${game.name}`}>
      <Stack>
        <Autocomplete
          label="Name"
          description={
            suggestions.data?.length
              ? `${suggestions.data.length} DLC found on ${suggestions.data[0].source === "steam" ? "Steam (with current price)" : "RAWG"}`
              : undefined
          }
          placeholder={suggestions.isFetching ? "Loading DLC list…" : "Type or pick a DLC"}
          data={(suggestions.data ?? []).map((d) => ({
            value: d.name,
            label: `${d.name}${d.price_cents !== null && d.price_cents !== undefined ? ` – ${euros(d.price_cents)}` : ""}${d.owned ? " (owned)" : ""}`,
            disabled: d.owned,
          }))}
          value={name}
          onChange={(v) => {
            setName(v);
            setIds({ steam_app_id: null, rawg_id: null });
          }}
          onOptionSubmit={pickSuggestion}
          limit={60}
          maxDropdownHeight={320}
          required
          data-autofocus
        />
        <Group grow>
          <DateField label="Bought on" value={buyDate} onChange={setBuyDate} required />
          <MoneyInput label="Price" value={price} onChange={setPrice} required />
        </Group>
        <StoreInput value={store} onChange={setStore} />
        <Group justify="flex-end">
          <Button onClick={() => mutation.mutate(undefined)} loading={mutation.isPending} disabled={!name.trim() || !buyDate || price === null}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// --- new game / device ------------------------------------------------------------------------

export function NewItemModal({
  opened,
  onClose,
  categoryId,
  defaultCategoryId,
  kind: initialKind = "game",
  wishlist = false,
  onCreated,
}: ModalProps & {
  categoryId?: number;
  /** preselected in the category picker (shown when there is no fixed `categoryId`) */
  defaultCategoryId?: number;
  kind?: ItemKind;
  wishlist?: boolean;
  onCreated?: (item: ItemRead) => void;
}) {
  const categories = useCategories();
  const metadata = useMetadataStatus();
  const [category, setCategory] = useState<number | null>(categoryId ?? defaultCategoryId ?? null);
  const [rawgPick, setRawgPick] = useState<Candidate | null>(null);
  const [kind, setKind] = useState<ItemKind>(initialKind);
  const [name, setName] = useState("");
  const [bought, setBought] = useState(!wishlist);
  const [status, setStatus] = useState<GameStatus>("backlog");
  const [target, setTarget] = useState<number | null>(null);
  const [copy, setCopy] = useState<CopyDraft>(emptyCopy(initialKind));
  // bundle: this game/device plus further items for one total price (console bundle, Steam bundle, Humble Bundle, …)
  const settings = useSettings();
  const [asBundle, setAsBundle] = useState(false);
  const [bundleName, setBundleName] = useState("");
  const [bundleMode, setBundleMode] = useState<SplitMode | null>(null);
  const [ownReference, setOwnReference] = useState<number | null>(null);
  const [ownManual, setOwnManual] = useState<number | null>(null);
  const [bundleEntries, setBundleEntries] = useState<BundleEntryDraft[]>([]);
  const selectedCategory = categories.data?.find((c) => c.id === category);
  const hardwareOnly = selectedCategory?.type === "hardware_only";
  const effectiveKind: ItemKind = hardwareOnly ? "hardware" : kind;
  const hasCopy = effectiveKind === "hardware" || bought;
  const [debouncedName] = useDebouncedValue(name, 400);
  const lookup = metadata.data?.rawg === true && effectiveKind === "game" && !rawgPick;
  const rawgResults = useRawgSearch(debouncedName, lookup);
  const bundle = !wishlist && hasCopy && asBundle;
  const isGame = effectiveKind === "game";
  const ownFormat: CopyFormat = isGame ? copy.format : "physical";
  const splitMode: SplitMode = bundleMode ?? settings.data?.bundle_split_mode ?? "proportional";
  const split = useSplitPreview(
    bundle ? copy.buy_price_cents : null,
    splitMode,
    [ownReference, ...bundleEntries.map((e) => e.reference)],
    [ownManual, ...bundleEntries.map((e) => e.manual)],
  );
  const createBundle = useApiMutation(
    async () => {
      const created = await unwrap(
        api.POST("/api/v1/bundles", {
          body: {
            name: bundleName.trim() || `${name.trim()} bundle`,
            buy_date: copy.buy_date!,
            total_price_cents: copy.buy_price_cents!,
            other_sales_cents: 0,
            store: copy.store,
            split_mode: splitMode,
            notes: null,
            entries: [
              {
                item_id: null,
                new_item: { category_id: category!, kind: effectiveKind, name: name.trim() },
                reference_price_cents: ownReference,
                buy_price_cents: splitMode === "manual" ? ownManual : null,
                format: ownFormat,
                condition: ownFormat === "physical" ? copy.condition : null,
                note: copy.note,
              },
              ...bundleEntries.map((e) => entryBody(e, splitMode)),
            ],
          },
        }),
      );
      // the first game of the bundle: apply the chosen status and RAWG match like for a single game
      const firstId = created.copies[0]?.item_id;
      if (isGame && firstId !== undefined) {
        try {
          if (status !== "backlog") {
            await unwrap(api.PATCH("/api/v1/items/{item_id}", { params: { path: { item_id: firstId } }, body: { status } }));
          }
          if (rawgPick) {
            await unwrap(
              api.POST("/api/v1/items/{item_id}/metadata", {
                params: { path: { item_id: firstId } },
                body: { rawg_id: rawgPick.rawg_id, rename: false },
              }),
            );
          }
        } catch (e) {
          notifications.show({ color: "yellow", message: `Bundle added, but: ${(e as Error).message}` });
        }
      }
      return created;
    },
    { success: (b) => `${name.trim()} added with ${b.copies.length - 1} more item(s) as bundle “${b.name}”`, onSuccess: onClose },
  );

  const mutation = useApiMutation(
    async () => {
      const item = await unwrap(
        api.POST("/api/v1/items", {
          body: {
            category_id: category!,
            kind: effectiveKind,
            name: name.trim(),
            status: effectiveKind === "game" ? (hasCopy ? status : "wishlist") : null,
            target_price_cents: !hasCopy ? target : null,
            first_copy: hasCopy
              ? copyBody({
                  ...copy,
                  format: effectiveKind === "hardware" ? "physical" : copy.format,
                  backup: copy.backup && effectiveKind === "game",
                })
              : null,
          },
        }),
      );
      if (!rawgPick) return item;
      try {
        return await unwrap(
          api.POST("/api/v1/items/{item_id}/metadata", {
            params: { path: { item_id: item.id } },
            body: { rawg_id: rawgPick.rawg_id, rename: false },
          }),
        );
      } catch (e) {
        notifications.show({ color: "yellow", message: `Added, but loading the RAWG info failed: ${(e as Error).message}` });
        return item;
      }
    },
    {
      success: (item) => `${item.name} added`,
      onSuccess: (item) => {
        onClose();
        onCreated?.(item);
      },
    },
  );
  const copyComplete = !hasCopy || (copy.buy_price_cents !== null && (!bundle || copy.buy_date));

  return (
    <Modal opened={opened} onClose={onClose} title={wishlist ? "Add to wishlist" : "Add game or device"} size="lg">
      <Stack>
        {!categoryId && (
          <Select
            label="Category"
            data={(categories.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
            value={category ? String(category) : null}
            onChange={(v) => setCategory(v ? Number(v) : null)}
            required
          />
        )}
        {!wishlist && !hardwareOnly && (
          <SegmentedControl
            data={[
              { value: "game", label: "Game" },
              { value: "hardware", label: "Hardware" },
            ]}
            value={kind}
            onChange={(v) => {
              setKind(v as ItemKind);
              setCopy(emptyCopy(v as ItemKind));
            }}
          />
        )}
        <TextInput
          label="Name"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value);
            setRawgPick(null);
          }}
          required
          data-autofocus
        />
        {rawgPick && (
          <Group gap="xs">
            <Text size="sm">
              Info and image from RAWG: <b>{rawgPick.name}</b>
            </Text>
            <Button size="compact-xs" variant="subtle" onClick={() => setRawgPick(null)}>
              remove
            </Button>
          </Group>
        )}
        {lookup && (rawgResults.data?.length ?? 0) > 0 && (
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              Pick the game to load its info and image (optional):
            </Text>
            {rawgResults.data!.slice(0, 4).map((c) => (
              <CandidateRow
                key={c.rawg_id}
                candidate={c}
                onPick={() => {
                  setRawgPick(c);
                  setName(c.name);
                }}
              />
            ))}
            <RawgAttribution />
          </Stack>
        )}
        {effectiveKind === "game" && !wishlist && (
          <Checkbox label="Already bought" checked={bought} onChange={(e) => setBought(e.currentTarget.checked)} />
        )}
        {effectiveKind === "game" && hasCopy && (
          <StatusSelect value={status} onChange={setStatus} allowWishlist={false} />
        )}
        {!hasCopy && <MoneyInput label="Target price" description="Get a deal badge when it's this cheap" value={target} onChange={setTarget} />}
        {!wishlist && hasCopy && (
          <Checkbox
            label={
              isGame
                ? "Bought as a bundle (e.g. a Steam bundle or Humble Bundle with several games)"
                : "Bought as a bundle (e.g. console + game, or with an extra controller)"
            }
            checked={asBundle}
            onChange={(e) => {
              setAsBundle(e.currentTarget.checked);
              if (e.currentTarget.checked && !bundleEntries.length) setBundleEntries([emptyEntry(category, ownFormat)]);
            }}
          />
        )}
        {bundle && (
          <TextInput
            label="Bundle name"
            placeholder={`${name.trim() || (isGame ? "Game" : "Console")} bundle`}
            value={bundleName}
            onChange={(e) => setBundleName(e.currentTarget.value)}
          />
        )}
        {hasCopy && (
          <CopyFields
            draft={copy}
            set={(p) => setCopy((c) => ({ ...c, ...p }))}
            kind={effectiveKind}
            showSale={false}
            priceLabel={bundle ? "Total price of the bundle" : "Buy price"}
            requireDate={bundle}
            allowBackup={effectiveKind === "game" && !bundle}
            allowLoan={effectiveKind === "game" && !bundle}
          />
        )}
        {bundle && (
          <BundleEntriesEditor
            mode={splitMode}
            onModeChange={setBundleMode}
            entries={bundleEntries}
            onEntriesChange={setBundleEntries}
            shares={split.data?.shares_cents}
            defaultCategory={category}
            defaultFormat={ownFormat}
            addLabel={isGame ? "Add another game" : "Add game or accessory"}
            error={split.isError ? split.error.message : null}
            firstShare={
              <Group grow align="flex-end">
                <Text size="sm">
                  <b>{name.trim() || (isGame ? "This game" : "This device")}</b>
                </Text>
                {splitMode === "proportional" && <MoneyInput label="Standalone price" value={ownReference} onChange={setOwnReference} />}
                {splitMode === "manual" && <MoneyInput label="Price share" value={ownManual} onChange={setOwnManual} />}
                <Text size="sm" fw={600} ta="right">
                  {split.data ? euros(split.data.shares_cents[0]) : ""}
                </Text>
              </Group>
            }
          />
        )}
        <Group justify="flex-end">
          {bundle ? (
            <Button
              onClick={() => createBundle.mutate(undefined)}
              loading={createBundle.isPending}
              disabled={!category || !name.trim() || !copyComplete || !bundleEntries.length || !bundleEntries.every(entryComplete) || !split.isSuccess}
            >
              Add bundle
            </Button>
          ) : (
            <Button onClick={() => mutation.mutate(undefined)} loading={mutation.isPending} disabled={!category || !name.trim() || !copyComplete}>
              Add
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
