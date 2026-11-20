/** Copies of a game or device: the copy fields (also used when adding a game) and the add/edit copy dialog. */
import { Alert, Button, Checkbox, Group, Modal, SegmentedControl, Select, Stack, TextInput } from "@mantine/core";
import { useState } from "react";
import { api, unwrap } from "@/api/client";
import { useApiMutation } from "@/api/queries";
import type { CopyCondition, CopyFormat, CopyRead, ItemKind, ItemRead } from "@/api/types";
import { todayIso } from "@/lib/format";
import { CONDITION, FORMAT, options } from "@/lib/labels";
import type { ModalProps } from "./common";
import { DateField, MoneyInput, StoreInput } from "./inputs";

export type CopyDraft = {
  buy_date: string | null;
  buy_price_cents: number | null;
  store: string | null;
  format: CopyFormat;
  condition: CopyCondition | null;
  sell_price_cents: number | null;
  sell_date: string | null;
  note: string | null;
  won: boolean;
  traded: boolean;
  backup: boolean;
  loaned: boolean;
};

export function CopyFields({
  draft,
  set,
  kind,
  inBundle = false,
  showSale = true,
  priceLabel = "Buy price",
  requireDate = false,
  allowBackup = false,
  allowLoan = false,
}: {
  draft: CopyDraft;
  set: (patch: Partial<CopyDraft>) => void;
  kind: ItemKind;
  inBundle?: boolean;
  showSale?: boolean;
  priceLabel?: string;
  requireDate?: boolean;
  allowBackup?: boolean; // games only, not for bundle copies
  allowLoan?: boolean; // games only, not for bundle copies
}) {
  // a copy you won or got in a trade cost nothing (a bundle copy's price comes from the bundle)
  const setTag = (tag: "won" | "traded", on: boolean) => set(on && !inBundle ? { [tag]: true, buy_price_cents: 0 } : { [tag]: on });
  // backup and loaned (borrowed) copies are free, have no buy date and can't be sold; a backup copy is also digital.
  // Ignored where a copy can't be one (hardware, bundles).
  const backup = allowBackup && draft.backup;
  const loaned = allowLoan && draft.loaned;
  const free = backup || loaned; // price and buy date are fixed
  const setFree = (kind: "backup" | "loaned", on: boolean) => {
    if (!on) return set({ [kind]: false });
    const digital = kind === "backup" ? ({ format: "digital", condition: null } as const) : {};
    set({ backup: kind === "backup", loaned: kind === "loaned", buy_price_cents: 0, buy_date: null, sell_price_cents: null, sell_date: null, ...digital });
  };
  return (
    <Stack gap="sm">
      {inBundle && (
        <Alert color="blue" variant="light">
          Bought in a bundle: buy date and price are set by the bundle (“Bundle” button in the copies list).
        </Alert>
      )}
      <Group grow>
        <DateField
          label="Bought on"
          placeholder={requireDate ? undefined : "Unknown"}
          value={draft.buy_date}
          onChange={(v) => set({ buy_date: v })}
          required={requireDate}
          clearable={!requireDate && !inBundle && !free}
          disabled={inBundle || free}
        />
        <MoneyInput
          label={priceLabel}
          value={draft.buy_price_cents}
          onChange={(v) => set({ buy_price_cents: v })}
          required
          disabled={inBundle || free}
        />
      </Group>
      <StoreInput value={draft.store} onChange={(v) => set({ store: v })} />
      {kind === "game" && (
        <SegmentedControl
          data={options(FORMAT)}
          value={draft.format}
          onChange={(v) => set({ format: v as CopyFormat, condition: v === "digital" ? null : draft.condition })}
          disabled={backup}
        />
      )}
      {(kind === "hardware" || draft.format === "physical") && (
        <Select
          label="Condition"
          data={options(CONDITION)}
          value={draft.condition}
          onChange={(v) => set({ condition: v as CopyCondition | null })}
          clearable
        />
      )}
      {showSale && !free && (
        <Group grow>
          <MoneyInput
            label="Sold for"
            description="Set = this copy is sold"
            value={draft.sell_price_cents}
            onChange={(v) => set({ sell_price_cents: v, sell_date: v === null ? null : (draft.sell_date ?? todayIso()) })}
          />
          <DateField label="Sold on" value={draft.sell_date} onChange={(v) => set({ sell_date: v })} disabled={draft.sell_price_cents === null} />
        </Group>
      )}
      <TextInput label="Note" placeholder="e.g. Collector's Edition" value={draft.note ?? ""} onChange={(e) => set({ note: e.currentTarget.value || null })} />
      <Group>
        <Checkbox label="Won (e.g. in a giveaway)" checked={draft.won} onChange={(e) => setTag("won", e.currentTarget.checked)} />
        <Checkbox label="Got it in a trade" checked={draft.traded} onChange={(e) => setTag("traded", e.currentTarget.checked)} />
        {allowBackup && (
          <Checkbox
            label="Backup copy"
            description="Free, digital, no buy date; can't be sold"
            checked={backup}
            onChange={(e) => setFree("backup", e.currentTarget.checked)}
          />
        )}
        {allowLoan && (
          <Checkbox
            label="Loaned copy"
            description="Borrowed: free, no buy date; can't be sold"
            checked={loaned}
            onChange={(e) => setFree("loaned", e.currentTarget.checked)}
          />
        )}
      </Group>
    </Stack>
  );
}

export const emptyCopy = (kind: ItemKind): CopyDraft => ({
  buy_date: todayIso(),
  buy_price_cents: null,
  store: null,
  format: kind === "game" ? "digital" : "physical",
  condition: null,
  sell_price_cents: null,
  sell_date: null,
  note: null,
  won: false,
  traded: false,
  backup: false,
  loaned: false,
});

export const copyBody = (d: CopyDraft) => ({ ...d, buy_price_cents: d.buy_price_cents! });

export function CopyModal({
  item,
  copy,
  opened,
  onClose,
}: ModalProps & { item: ItemRead; copy?: CopyRead }) {
  const [draft, setDraft] = useState<CopyDraft>(copy ? { ...copy } : emptyCopy(item.kind));
  const set = (patch: Partial<CopyDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const inBundle = Boolean(copy?.bundle_id);
  const mutation = useApiMutation(
    () => {
      if (!copy) {
        return unwrap(
          api.POST("/api/v1/items/{item_id}/copies", { params: { path: { item_id: item.id } }, body: copyBody(draft) }),
        );
      }
      const { buy_date, buy_price_cents, ...rest } = draft;
      return unwrap(
        api.PATCH("/api/v1/items/{item_id}/copies/{copy_id}", {
          params: { path: { item_id: item.id, copy_id: copy.id } },
          body: inBundle ? rest : { ...rest, buy_date, buy_price_cents },
        }),
      );
    },
    { success: copy ? "Copy saved" : "Copy added", onSuccess: onClose },
  );
  return (
    <Modal opened={opened} onClose={onClose} title={copy ? "Edit copy" : `Add a copy – ${item.name}`}>
      <Stack>
        <CopyFields
          draft={draft}
          set={set}
          kind={item.kind}
          inBundle={inBundle}
          allowBackup={item.kind === "game" && !inBundle}
          allowLoan={item.kind === "game" && !inBundle}
        />
        <Group justify="flex-end">
          <Button onClick={() => mutation.mutate(undefined)} loading={mutation.isPending} disabled={draft.buy_price_cents === null}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
