import { day, euros, fromCents, hours, perHour, percent, toCents } from "./format";

const normalize = (s: string) => s.replace(/ | /g, " ");

test("euros use German formatting", () => {
  expect(normalize(euros(123456))).toBe("1.234,56 €");
  expect(normalize(euros(0))).toBe("0,00 €");
  expect(euros(null)).toBe("–");
  expect(normalize(perHour(300))).toBe("3,00 €/h");
});

test("hours and percent", () => {
  expect(normalize(hours(10.5))).toBe("10,5 h");
  expect(normalize(hours(2))).toBe("2 h");
  expect(normalize(percent(0.615))).toBe("62 %");
  expect(hours(undefined)).toBe("–");
});

test("dates as DD.MM.YYYY", () => {
  expect(day("2026-09-17")).toBe("17.09.2026");
  expect(day("2026-09-17T10:00:00Z")).toBe("17.09.2026");
  expect(day(null)).toBe("–");
});

test("euro inputs to cents and back", () => {
  expect(toCents(59.99)).toBe(5999);
  expect(toCents("13,47")).toBe(1347);
  expect(toCents("")).toBeNull();
  expect(toCents(0.1 + 0.2)).toBe(30);
  expect(fromCents(1347)).toBe(13.47);
  expect(fromCents(null)).toBe("");
});
