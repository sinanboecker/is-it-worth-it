import {
  Button,
  Group,
  Input,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { useState } from "react";
import { api, unwrap } from "@/api/client";
import { useApiMutation } from "@/api/queries";
import type { Category, CategoryIconName } from "@/api/types";
import { CATEGORY_ICONS, guessIcon } from "./CategoryIcon";
import { DeviceSelect, MoneyInput } from "./inputs";

/** Create or edit a category. `onClose` gets the saved category, or nothing when cancelled. */
export function CategoryModal({ category, onClose }: { category?: Category; onClose: (saved?: Category) => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [type, setType] = useState(category?.type ?? "platform");
  const [defaultDevice, setDefaultDevice] = useState(category?.default_device_id ?? null);
  const [override, setOverride] = useState(category?.break_even_cph ?? null);
  const [sortOrder, setSortOrder] = useState<number>(category?.sort_order ?? 0);
  const [icon, setIcon] = useState<CategoryIconName | null>(category?.icon ?? null);
  const guessed = CATEGORY_ICONS[guessIcon({ name, type })];
  const save = useApiMutation(
    () => {
      const body = {
        name: name.trim(),
        type,
        default_device_id: defaultDevice,
        break_even_cph: override,
        sort_order: sortOrder,
        icon,
      };
      return category
        ? unwrap(api.PATCH("/api/v1/categories/{category_id}", { params: { path: { category_id: category.id } }, body }))
        : unwrap(api.POST("/api/v1/categories", { body }));
    },
    { success: "Category saved", onSuccess: (saved) => onClose(saved) },
  );
  return (
    <Modal opened onClose={() => onClose()} title={category ? `Edit ${category.name}` : "New category"}>
      <Stack>
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} required data-autofocus />
        <SegmentedControl
          data={[
            { value: "platform", label: "Platform (games + hardware)" },
            { value: "hardware_only", label: "Hardware only" },
          ]}
          value={type}
          onChange={(v) => setType(v as Category["type"])}
        />
        <Input.Wrapper
          label="Icon"
          description={`Shown in the sidebar. Auto picks one from the name (now: ${guessed.label}).`}
        >
          <SegmentedControl
            mt={6}
            fullWidth
            aria-label="Icon"
            value={icon ?? "auto"}
            onChange={(v) => setIcon(v === "auto" ? null : (v as CategoryIconName))}
            data={[
              {
                value: "auto",
                label: (
                  <Group gap={6} wrap="nowrap" justify="center">
                    <guessed.icon size={18} />
                    <span>Auto</span>
                  </Group>
                ),
              },
              ...(Object.entries(CATEGORY_ICONS) as [CategoryIconName, (typeof CATEGORY_ICONS)[CategoryIconName]][]).map(
                ([value, { label, icon: Icon }]) => ({
                  value,
                  label: (
                    <Tooltip label={label} withinPortal>
                      <Group justify="center">
                        <Icon size={18} />
                        <VisuallyHidden>{label}</VisuallyHidden>
                      </Group>
                    </Tooltip>
                  ),
                }),
              ),
            ]}
          />
        </Input.Wrapper>
        <DeviceSelect
          label="Default device"
          value={defaultDevice}
          onChange={setDefaultDevice}
        />
        <Text size="xs" c="dimmed" mt={-8}>
          Linked to new games of this category and pre-selected for hours.
        </Text>
        <MoneyInput
          label="Break-even override (per hour)"
          description="Empty = use the global value"
          value={override}
          onChange={setOverride}
        />
        <NumberInput label="Sort order" value={sortOrder} onChange={(v) => setSortOrder(Number(v) || 0)} />
        <Group justify="flex-end">
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!name.trim()}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
