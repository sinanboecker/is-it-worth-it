import { MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import { HeatmapCalendar, yearGrid } from "./HeatmapCalendar";

test("year grid: weeks start on Monday, every day exactly once", () => {
  const weeks = yearGrid(2026); // 1 Jan 2026 is a Thursday
  expect(weeks[0]).toEqual([null, null, null, "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
  const days = weeks.flat().filter(Boolean);
  expect(days).toHaveLength(365);
  expect(new Set(days).size).toBe(365);
  expect(days.at(-1)).toBe("2026-12-31");
  expect(yearGrid(2024).flat().filter(Boolean)).toHaveLength(366);
});

test("days with finishes are marked", () => {
  const { container } = render(
    <MantineProvider>
      <HeatmapCalendar
        heatmap={{ year: 2026, days: { "2026-08-15": 2, "2026-02-01": 1 }, total: 3, max_per_day: 2, years_available: [2026] }}
      />
    </MantineProvider>,
  );
  const marked = [...container.querySelectorAll("rect")].filter((r) => r.getAttribute("data-count") !== "0");
  expect(marked.map((r) => r.getAttribute("data-count"))).toEqual(["1", "2"]);
  expect(container.querySelectorAll("rect")).toHaveLength(365);
});
