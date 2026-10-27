/** Dialogs for PC builds and parts. */
import { Button, Group, Modal, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { api, unwrap } from "@/api/client";
import { useApiMutation, usePcBuilds } from "@/api/queries";
import type { PcBuild, PcPart } from "@/api/types";
import { todayIso } from "@/lib/format";
import { DateField, DeviceSelect, MoneyInput } from "./inputs";

function confirmDelete(title: string, text: string, onConfirm: () => void) {
  modals.openConfirmModal({
    title,
    children: <Text size="sm">{text}</Text>,
    labels: { confirm: "Delete", cancel: "Cancel" },
    confirmProps: { color: "red" },
    onConfirm,
  });
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
export function PcPartModal({ part, buildId, onClose }: { part?: PcPart; buildId?: number | null; onClose: () => void }) {
  const builds = usePcBuilds();
  const [name, setName] = useState(part?.name ?? "");
  const [build, setBuild] = useState<number | null>(part ? part.build_id : (buildId ?? null));
  const [buyDate, setBuyDate] = useState<string | null>(part?.buy_date ?? todayIso());
  const [usedUntil, setUsedUntil] = useState<string | null>(part?.used_until ?? null);
  const [buyPrice, setBuyPrice] = useState<number | null>(part?.buy_price_cents ?? null);
  const [sellPrice, setSellPrice] = useState<number | null>(part?.sell_price_cents ?? null);
  const [notes, setNotes] = useState(part?.notes ?? "");
  const datesWrong = Boolean(buyDate && usedUntil && usedUntil < buyDate);
  const save = useApiMutation(
    () => {
      const body = {
        name: name.trim(),
        build_id: build,
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
        <TextInput label="Name" placeholder="e.g. RTX 4070 Super" value={name} onChange={(e) => setName(e.currentTarget.value)} required data-autofocus />
        <Select
          label="Build"
          placeholder="No build"
          data={(builds.data ?? []).map((b) => ({ value: String(b.id), label: b.name }))}
          value={build ? String(build) : null}
          onChange={(v) => setBuild(v ? Number(v) : null)}
          clearable
        />
        <Group grow align="flex-start">
          <DateField label="Bought on" value={buyDate} onChange={setBuyDate} required />
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
          <MoneyInput label="Buy price" value={buyPrice} onChange={setBuyPrice} required />
          <MoneyInput label="Sell price" value={sellPrice} onChange={setSellPrice} />
        </Group>
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
            disabled={!name.trim() || !buyDate || buyPrice === null || datesWrong}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
