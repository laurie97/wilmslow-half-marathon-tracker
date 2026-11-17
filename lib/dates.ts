// Small UTC-based helpers for YYYY-MM-DD date strings.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  return ms;
}

function fromUtc(ms: number): string {
  const result = new Date(ms).toISOString().slice(0, 10);
  return result;
}

/** True if the string is a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    return false;
  }
  const valid = fromUtc(toUtc(value)) === value;
  return valid;
}

export function addDays(date: string, days: number): string {
  const result = fromUtc(toUtc(date) + days * DAY_MS);
  return result;
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  const days = Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
  return days;
}

export function weekday(date: string): number {
  const day = new Date(toUtc(date)).getUTCDay();
  return day;
}

/** "Mon" or "Monday" for a date. */
export function dayName(date: string, style: "short" | "long" = "short"): string {
  const names = style === "short" ? SHORT_DAYS : LONG_DAYS;
  const name = names[weekday(date)];
  return name;
}

/** Today's date (YYYY-MM-DD) in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(now);
  return today;
}

/** Seconds since the epoch for midnight UTC on the given date. */
export function epochSeconds(date: string): number {
  const seconds = Math.floor(toUtc(date) / 1000);
  return seconds;
}
