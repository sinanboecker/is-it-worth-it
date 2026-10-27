/** Dialogs for PC builds and parts. */
import { Button, Group, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import {
  IconBolt,
  IconBox,
  IconCpu,
  IconDatabase,
  IconDeviceDesktop,
  IconDots,
  IconLayoutBoardSplit,
  IconPropeller,
  IconStack2,
  IconTrash,
} from "@tabler/icons-react";
import { createElement, useState, type ComponentType } from "react";
import { api, unwrap } from "@/api/client";
import { useApiMutation, usePcBuilds } from "@/api/queries";
import type { PcBuild, PcPart, PcPartCategory } from "@/api/types";
import { todayIso } from "@/lib/format";
import { PC_PART_CATEGORY } from "@/lib/labels";
import { confirmDelete } from "./common";
import { DateField, DeviceSelect, MoneyInput } from "./inputs";

export const PC_PART_ICON: Record<PcPartCategory, ComponentType<{ size?: number | string }>> = {
  cpu: IconCpu,
  gpu: IconDeviceDesktop,
  mainboard: IconLayoutBoardSplit,
  memory: IconStack2,
  storage: IconDatabase,
  power_supply: IconBolt,
  cooling: IconPropeller,
  case: IconBox,
  other: IconDots,
};

const CATEGORY_ORDER = Object.keys(PC_PART_CATEGORY) as PcPartCategory[];

/** Parts of a build in category order (CPU, GPU, mainboard, …), then by buy date. */
export const byCategory = (parts: PcPart[]) =>
  [...parts].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.buy_date.localeCompare(b.buy_date),
  );

/** Category picker with the category icons. */
export function PartCategorySelect({
  value,
  onChange,
  label = "Category",
}: {
  value: PcPartCategory | null;
  onChange: (category: PcPartCategory) => void;
  label?: string;
}) {
  return (
    <Select
      label={label}
      placeholder="Choose one"
      data={Object.entries(PC_PART_CATEGORY).map(([v, l]) => ({ value: v, label: l }))}
      value={value}
      onChange={(v) => v && onChange(v as PcPartCategory)}
      renderOption={({ option }) => {
        const Icon = PC_PART_ICON[option.value as PcPartCategory];
        return (
          <Group gap="xs">
            <Icon size={16} />
            {option.label}
          </Group>
        );
      }}
      leftSection={value ? createElement(PC_PART_ICON[value], { size: 16 }) : undefined}
      allowDeselect={false}
      required
    />
  );
}

/** New or edit a build: name, linked device (its game hours), notes. */
export function PcBuildModal({ build, onClose }: { build?: PcBuild; onClose: () => void }) {
  const [name, setName] = useState(build?.name ?? "");
  const [device, setDevice] = useState<number | null>(build?.hardware_id ?? null);
  const [notes, setNotes] = useState(build?.notes ?? "");
  const save = useApiMutation(
    () => {
      const body = { name: name.trim(), hardware_id: device, notes: notes.trim() || null };
      return build
        ? unwrap(api.PATCH("/api/v1/pc/builds/{build_id}", { params: { path: { build_id: build.id } }, body }))
        : unwrap(api.POST("/api/v1/pc/builds", { body }));
    },
    { success: (b) => `Build “${b.name}” saved`, onSuccess: onClose },
  );
  const remove = useApiMutation(
    () => unwrap(api.DELETE("/api/v1/pc/builds/{build_id}", { params: { path: { build_id: build!.id } } })),
    { success: "Build deleted", onSuccess: onClose },
  );
  return (
    <Modal opened onClose={onClose} title={build ? `Edit ${build.name}` : "New PC build"}>
      <Stack>
        <TextInput label="Name" placeholder="e.g. Gaming PC 2023" value={name} onChange={(e) => setName(e.currentTarget.value)} required data-autofocus />
        <DeviceSelect
          label="Device in the app"
          description="Optional: the hardware your game hours are booked on, to show them for this build."
          value={device}
          onChange={setDevice}
        />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} autosize minRows={2} />
        <Group justify={build ? "space-between" : "flex-end"}>
          {build && (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => confirmDelete(`Delete ${build.name}?`, "Its parts stay, without a build.", () => remove.mutate(undefined))}
            >
              Delete build
            </Button>
          )}
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!name.trim()}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** New or edit a part: name, build, bought / used until, buy and sell price, notes. */
export function PcPartModal({
  part,
  buildId,
  onClose,
  onEditSale,
}: {
  part?: PcPart;
  buildId?: number | null;
  onClose: () => void;
  onEditSale?: (saleId: number) => void;
}) {
  const builds = usePcBuilds();
  const [name, setName] = useState(part?.name ?? "");
  const [category, setCategory] = useState<PcPartCategory | null>(part?.category ?? null);
  const [build, setBuild] = useState<number | null>(part ? part.build_id : (buildId ?? null));
  const [buyDate, setBuyDate] = useState<string | null>(part?.buy_date ?? todayIso());
  const [usedUntil, setUsedUntil] = useState<string | null>(part?.used_until ?? null);
  const [buyPrice, setBuyPrice] = useState<number | null>(part?.buy_price_cents ?? null);
  const [sellPrice, setSellPrice] = useState<number | null>(part?.sell_price_cents ?? null);
  const [notes, setNotes] = useState(part?.notes ?? "");
  const datesWrong = Boolean(buyDate && usedUntil && usedUntil < buyDate);
  const sold = sellPrice !== null; // a sold part leaves its build
  const fromPurchase = part?.purchase_id ? `Set by the purchase “${part.purchase_name}”.` : undefined;
  const saleId = part?.sale_id;
  const save = useApiMutation(
    () => {
      const body = {
        name: name.trim(),
        category: category!,
        build_id: sold ? null : build,
        buy_date: buyDate!,
        used_until: usedUntil,
        buy_price_cents: buyPrice!,
        sell_price_cents: sellPrice,
        notes: notes.trim() || null,
      };
      return part
        ? unwrap(api.PATCH("/api/v1/pc/parts/{part_id}", { params: { path: { part_id: part.id } }, body }))
        : unwrap(api.POST("/api/v1/pc/parts", { body }));
    },
    { success: (p) => `${p.name} saved`, onSuccess: onClose },
  );
  const remove = useApiMutation(
    () => unwrap(api.DELETE("/api/v1/pc/parts/{part_id}", { params: { path: { part_id: part!.id } } })),
    { success: "Part deleted", onSuccess: onClose },
  );
  return (
    <Modal opened onClose={onClose} title={part ? `Edit ${part.name}` : "Add PC part"}>
      <Stack>
        <Group grow align="flex-start">
          <TextInput label="Name" placeholder="e.g. RTX 4070 Super" value={name} onChange={(e) => setName(e.currentTarget.value)} required data-autofocus />
          <PartCategorySelect value={category} onChange={setCategory} />
        </Group>
        <Select
          label="Build"
          description={sold ? "Sold parts aren't in a build any more." : undefined}
          placeholder="No build"
          data={(builds.data ?? []).map((b) => ({ value: String(b.id), label: b.name }))}
          value={build && !sold ? String(build) : null}
          onChange={(v) => setBuild(v ? Number(v) : null)}
          disabled={sold}
          clearable
        />
        <Group grow align="flex-start">
          <DateField label="Bought on" value={buyDate} onChange={setBuyDate} required disabled={Boolean(fromPurchase)} />
          <DateField
            label="Used until"
            placeholder="Still in use"
            value={usedUntil}
            onChange={setUsedUntil}
            clearable
            error={datesWrong ? "Before the buy date" : null}
          />
        </Group>
        <Group grow align="flex-start">
          <MoneyInput
            label="Buy price"
            description={fromPurchase}
            value={buyPrice}
            onChange={setBuyPrice}
            required
            disabled={Boolean(fromPurchase)}
          />
          <MoneyInput
            label="Sell price"
            description={saleId ? `Sold together: “${part!.sale_name}”.` : undefined}
            value={sellPrice}
            onChange={setSellPrice}
            disabled={Boolean(saleId)}
          />
        </Group>
        {saleId && onEditSale && (
          <Group justify="flex-end" mt={-8}>
            <Button size="xs" variant="subtle" onClick={() => onEditSale(saleId)}>
              Edit sale
            </Button>
          </Group>
        )}
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} autosize minRows={2} />
        <Group justify={part ? "space-between" : "flex-end"}>
          {part && (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => confirmDelete(`Delete ${part.name}?`, "The part is removed for good.", () => remove.mutate(undefined))}
            >
              Delete part
            </Button>
          )}
          <Button
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={!name.trim() || !category || !buyDate || buyPrice === null || datesWrong}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
