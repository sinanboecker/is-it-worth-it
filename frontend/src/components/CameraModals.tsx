/** Dialog for camera gear: bodies, lenses, adapters and other gear. */
import { Autocomplete, Button, Group, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { IconAperture, IconCamera, IconCirclesRelation, IconDots, IconTrash } from "@tabler/icons-react";
import { createElement, useState, type ComponentType } from "react";
import { api, unwrap } from "@/api/client";
import { useApiMutation, useCameraGear } from "@/api/queries";
import type { CameraGear, CameraGearCategory } from "@/api/types";
import { todayIso } from "@/lib/format";
import { CAMERA_GEAR_CATEGORY } from "@/lib/labels";
import { confirmDelete } from "./common";
import { DateField, MoneyInput } from "./inputs";

export const CAMERA_GEAR_ICON: Record<CameraGearCategory, ComponentType<{ size?: number | string }>> = {
  body: IconCamera,
  lens: IconAperture,
  adapter: IconCirclesRelation,
  other: IconDots,
};

const SINGULAR: Record<CameraGearCategory, string> = { body: "Camera body", lens: "Lens", adapter: "Adapter", other: "Other" };

/** New or edit gear: name, category, manufacturer, bought / sold (date and price), notes. */
export function CameraGearModal({
  gear,
  category: initialCategory,
  onClose,
}: {
  gear?: CameraGear;
  category?: CameraGearCategory;
  onClose: () => void;
}) {
  const all = useCameraGear();
  const [name, setName] = useState(gear?.name ?? "");
  const [category, setCategory] = useState<CameraGearCategory | null>(gear?.category ?? initialCategory ?? null);
  const [manufacturer, setManufacturer] = useState(gear?.manufacturer ?? "");
  const [buyDate, setBuyDate] = useState<string | null>(gear ? gear.buy_date : todayIso());
  const [buyPrice, setBuyPrice] = useState<number | null>(gear?.buy_price_cents ?? null);
  const [sellDate, setSellDate] = useState<string | null>(gear?.sell_date ?? null);
  const [sellPrice, setSellPrice] = useState<number | null>(gear?.sell_price_cents ?? null);
  const [notes, setNotes] = useState(gear?.notes ?? "");
  const datesWrong = Boolean(buyDate && sellDate && sellDate < buyDate);
  // manufacturers used so far, to pick from
  const manufacturers = [...new Set((all.data ?? []).map((g) => g.manufacturer).filter((m) => m !== null))].sort();
  const save = useApiMutation(
    () => {
      const body = {
        name: name.trim(),
        category: category!,
        manufacturer: manufacturer.trim() || null,
        buy_date: buyDate,
        buy_price_cents: buyPrice!,
        sell_date: sellDate,
        sell_price_cents: sellPrice,
        notes: notes.trim() || null,
      };
      return gear
        ? unwrap(api.PATCH("/api/v1/camera/gear/{gear_id}", { params: { path: { gear_id: gear.id } }, body }))
        : unwrap(api.POST("/api/v1/camera/gear", { body }));
    },
    { success: (g) => `${g.name} saved`, onSuccess: onClose },
  );
  const remove = useApiMutation(
    () => unwrap(api.DELETE("/api/v1/camera/gear/{gear_id}", { params: { path: { gear_id: gear!.id } } })),
    { success: "Gear deleted", onSuccess: onClose },
  );
  return (
    <Modal opened onClose={onClose} title={gear ? `Edit ${gear.name}` : "Add camera gear"}>
      <Stack>
        <Group grow align="flex-start">
          <TextInput label="Name" placeholder="e.g. X-T5" value={name} onChange={(e) => setName(e.currentTarget.value)} required data-autofocus />
          <Select
            label="Category"
            placeholder="Choose one"
            data={Object.keys(CAMERA_GEAR_CATEGORY).map((v) => ({ value: v, label: SINGULAR[v as CameraGearCategory] }))}
            value={category}
            onChange={(v) => v && setCategory(v as CameraGearCategory)}
            renderOption={({ option }) => (
              <Group gap="xs">
                {createElement(CAMERA_GEAR_ICON[option.value as CameraGearCategory], { size: 16 })}
                {option.label}
              </Group>
            )}
            leftSection={category ? createElement(CAMERA_GEAR_ICON[category], { size: 16 }) : undefined}
            allowDeselect={false}
            required
          />
        </Group>
        <Autocomplete label="Manufacturer" placeholder="e.g. Fujifilm" data={manufacturers} value={manufacturer} onChange={setManufacturer} />
        <Group grow align="flex-start">
          <DateField label="Bought on" placeholder="Unknown" value={buyDate} onChange={setBuyDate} clearable />
          <MoneyInput label="Price" value={buyPrice} onChange={setBuyPrice} required />
        </Group>
        <Group grow align="flex-start">
          <DateField
            label="Sold on"
            placeholder="Not sold"
            value={sellDate}
            onChange={setSellDate}
            clearable
            error={datesWrong ? "Before the buy date" : null}
          />
          <MoneyInput label="Sold for" value={sellPrice} onChange={setSellPrice} />
        </Group>
        <Textarea label="Note" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} autosize minRows={2} />
        <Group justify={gear ? "space-between" : "flex-end"}>
          {gear && (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => confirmDelete(`Delete ${gear.name}?`, "It is removed for good.", () => remove.mutate(undefined))}
            >
              Delete
            </Button>
          )}
          <Button
            onClick={() => save.mutate(undefined)}
            loading={save.isPending}
            disabled={!name.trim() || !category || buyPrice === null || datesWrong}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
