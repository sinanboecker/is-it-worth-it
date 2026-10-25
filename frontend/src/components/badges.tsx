import { Badge, Group, Tooltip } from "@mantine/core";
import { IconCloudDownload, IconDisc, IconPackage } from "@tabler/icons-react";
import type { GameStatus, ItemSummary, Value } from "@/api/types";
import { hours, perHour } from "@/lib/format";
import { STATUS } from "@/lib/labels";

/** Badges in tight table cells must never be cut off ("Currentl…"). */
const NO_TRUNCATE = { root: { maxWidth: "none", overflow: "visible" }, label: { overflow: "visible" } } as const;

export function StatusBadge({ status }: { status: GameStatus | null | undefined }) {
  if (!status) return null;
  return (
    <Badge color={STATUS[status].color} variant="light" tt="none" styles={NO_TRUNCATE}>
      {STATUS[status].label}
    </Badge>
  );
}

/** ✔ when worth it, otherwise "x h left" until the break-even. */
export function WorthItBadge({ value }: { value: Value | null | undefined }) {
  if (!value) return null;
  if (value.worth_it) {
    return (
      <Tooltip label={`Below the break-even of ${perHour(value.threshold_cph)}`}>
        <Badge color="green" variant="light" tt="none" styles={NO_TRUNCATE}>
          ✔ worth it
        </Badge>
      </Tooltip>
    );
  }
  return (
    <Tooltip label={`Break-even: ${perHour(value.threshold_cph)}`}>
      <Badge color="orange" variant="light" tt="none" styles={NO_TRUNCATE}>
        {hours(value.hours_to_break_even)} left
      </Badge>
    </Tooltip>
  );
}

export function CopyBadges({ item }: { item: ItemSummary }) {
  const c = item.copies_summary;
  return (
    <Group gap={4} wrap="nowrap">
      {c.copies_count > 1 && (
        <Badge variant="outline" size="sm">
          {c.copies_count}×
        </Badge>
      )}
      {c.formats.includes("physical") && (
        <Tooltip label="Physical">
          <IconDisc size={16} />
        </Tooltip>
      )}
      {c.formats.includes("digital") && item.kind === "game" && (
        <Tooltip label="Digital">
          <IconCloudDownload size={16} />
        </Tooltip>
      )}
      {c.in_bundle && (
        <Tooltip label="Bought in a bundle">
          <IconPackage size={16} />
        </Tooltip>
      )}
      {c.sold && (
        <Badge color="gray" size="sm" tt="none" styles={NO_TRUNCATE}>
          Sold
        </Badge>
      )}
    </Group>
  );
}
