/** Display formatting: EUR with German number formatting, dates as DD.MM.YYYY. */

import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

const euroFormat = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const numberFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const percentFormat = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 });
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long" });

export const euros = (cents: number | null | undefined): string =>
  cents === null || cents === undefined ? "–" : euroFormat.format(cents / 100);

export const perHour = (cents: number | null | undefined): string =>
  cents === null || cents === undefined ? "–" : `${euros(cents)}/h`;

export const hours = (value: number | null | undefined): string =>
  value === null || value === undefined ? "–" : `${numberFormat.format(value)} h`;

export const perDay = (cents: number | null | undefined): string =>
  cents === null || cents === undefined ? "–" : `${euros(cents)}/day`;

export const years = (value: number | null | undefined): string =>
  value === null || value === undefined ? "–" : `${numberFormat.format(value)} ${value === 1 ? "year" : "years"}`;

export const percent = (value: number | null | undefined): string =>
  value === null || value === undefined ? "–" : percentFormat.format(value);

/** "2026-09-17" → "17.09.2026" */
export const day = (iso: string | null | undefined): string => {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};

export const monthName = (month: number): string => monthFormat.format(new Date(2000, month - 1, 1));

export const todayIso = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** € (as typed in an input) → cents, and back. */
export const toCents = (euroValue: number | string | null | undefined): number | null => {
  if (euroValue === null || euroValue === undefined || euroValue === "") return null;
  const n = typeof euroValue === "number" ? euroValue : Number(String(euroValue).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export const fromCents = (cents: number | null | undefined): number | "" =>
  cents === null || cents === undefined ? "" : cents / 100;

// day and month with or without leading zero, 4- or 2-digit year (strict parsing needs every variant)
const TYPED_DATE_FORMATS = [
  ...["D", "DD"].flatMap((d) => ["M", "MM"].flatMap((m) => ["YYYY", "YY"].map((y) => `${d}.${m}.${y}`))),
  "YYYY-MM-DD",
];

/** Parse a typed date as German day.month.year (or ISO); null for anything else, incl. impossible dates like 31.02. */
export function parseTypedDate(input: string): string | null {
  const parsed = dayjs(input.trim(), TYPED_DATE_FORMATS, true);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : null;
}
