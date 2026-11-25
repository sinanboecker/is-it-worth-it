/** Hours played per day of a year, from play sessions, as a calendar of weeks (Monday to Sunday). */
import { Box, Group, Select, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { usePlayedDays } from "@/api/queries";
import { day, hours } from "@/lib/format";

const SHADES = ["blue.2", "blue.4", "blue.6", "blue.8"]; // up to 1 h, 2 h, 4 h, more
const shade = (h: number) => SHADES[h <= 1 ? 0 : h <= 2 ? 1 : h <= 4 ? 2 : 3];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The weeks of a year, Monday first; days of the year before or after are null. */
export function calendarWeeks(year: number): (string | null)[][] {
  const first = new Date(year, 0, 1);
  const start = new Date(year, 0, 1 - ((first.getDay() + 6) % 7)); // the Monday of the first week
  const weeks: (string | null)[][] = [];
  for (const d = start; d.getFullYear() <= year; ) {
    const week: (string | null)[] = [];
    for (let i = 0; i < 7; i++, d.setDate(d.getDate() + 1)) week.push(d.getFullYear() === year ? iso(d) : null);
    weeks.push(week);
  }
  return weeks;
}

export function PlayedCalendar({ years }: { years: number[] }) {
  const [year, setYear] = useState(years[0]);
  const days = usePlayedDays(year);
  const byDay = new Map((days.data ?? []).map((d) => [d.day, d.hours]));
  const total = (days.data ?? []).reduce((sum, d) => sum + d.hours, 0);
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {hours(Math.round(total * 100) / 100)} on {byDay.size} day{byDay.size === 1 ? "" : "s"}
        </Text>
        <Select
          aria-label="Year"
          w={110}
          size="xs"
          data={years.map(String)}
          value={String(year)}
          onChange={(v) => v && setYear(Number(v))}
          allowDeselect={false}
        />
      </Group>
      <Box style={{ overflowX: "auto" }}>
        <Group gap={3} wrap="nowrap" align="flex-start">
          {calendarWeeks(year).map((week, w) => (
            <Stack key={w} gap={3}>
              {week.map((d, i) => {
                const h = d ? byDay.get(d) : undefined;
                return (
                  <Box
                    key={i}
                    w={11}
                    h={11}
                    bg={!d ? "transparent" : h ? shade(h) : "var(--mantine-color-default-border)"}
                    style={{ borderRadius: 2 }}
                    title={d ? `${day(d)}: ${h ? hours(h) : "not played"}` : undefined}
                    aria-label={d && h ? `${day(d)}: ${hours(h)}` : undefined}
                  />
                );
              })}
            </Stack>
          ))}
        </Group>
      </Box>
    </Stack>
  );
}
