import { calendarWeeks } from "./PlayedCalendar";

test("weeks run Monday to Sunday and only hold the year's days", () => {
  const weeks = calendarWeeks(2026); // 1 January 2026 is a Thursday
  expect(weeks[0]).toEqual([null, null, null, "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
  expect(weeks.flat().filter(Boolean)).toHaveLength(365);
  expect(weeks.at(-1)).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", null, null, null]);
});
