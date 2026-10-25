import { Box, Tooltip, useMantineTheme } from "@mantine/core";
import type { Heatmap } from "@/api/types";
import { day } from "@/lib/format";

const CELL = 12;
const GAP = 3;
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Days of `year` laid out in weeks (columns, Monday first), like GitHub's contribution graph. */
export function yearGrid(year: number): (string | null)[][] {
  const first = new Date(year, 0, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = Array(offset).fill(null);
  for (let d = new Date(first); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    week.push(isoDate(d));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);
  return weeks;
}

export function HeatmapCalendar({
  heatmap,
  onDayClick,
}: {
  heatmap: Heatmap;
  onDayClick?: (iso: string) => void;
}) {
  const theme = useMantineTheme();
  const weeks = yearGrid(heatmap.year);
  const shades = [theme.colors.green[2], theme.colors.green[4], theme.colors.green[6], theme.colors.green[8]];
  const colorFor = (count: number) => {
    if (!count) return "var(--mantine-color-default-border)";
    const level = Math.min(shades.length - 1, Math.ceil((count / Math.max(heatmap.max_per_day, 1)) * shades.length) - 1);
    return shades[level];
  };
  const labelWidth = 28;
  const width = labelWidth + weeks.length * (CELL + GAP);
  const height = 7 * (CELL + GAP) + 16;
  const monthLabels = weeks
    .map((week, i) => ({ i, first: week.find((d) => d?.endsWith("-01")) }))
    .filter((w) => w.first);

  return (
    <Box style={{ overflowX: "auto" }}>
      <svg width={width} height={height} role="img" aria-label={`Games finished per day in ${heatmap.year}`}>
        {monthLabels.map(({ i, first }) => (
          <text key={first} x={labelWidth + i * (CELL + GAP)} y={10} fontSize={10} fill="currentColor" opacity={0.6}>
            {new Date(first!).toLocaleString("en-GB", { month: "short" })}
          </text>
        ))}
        {DAY_LABELS.map((label, row) => (
          <text key={row} x={0} y={16 + row * (CELL + GAP) + CELL - 2} fontSize={9} fill="currentColor" opacity={0.6}>
            {label}
          </text>
        ))}
        {weeks.map((week, col) =>
          week.map((date, row) => {
            if (!date) return null;
            const count = heatmap.days[date] ?? 0;
            return (
              <Tooltip key={date} label={`${day(date)}: ${count ? `${count} finished` : "nothing finished"}`} withinPortal>
                <rect
                  x={labelWidth + col * (CELL + GAP)}
                  y={16 + row * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  fill={colorFor(count)}
                  style={{ cursor: count && onDayClick ? "pointer" : undefined }}
                  onClick={() => count && onDayClick?.(date)}
                  data-count={count}
                />
              </Tooltip>
            );
          }),
        )}
      </svg>
    </Box>
  );
}
