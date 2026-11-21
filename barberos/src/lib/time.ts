/** Time helpers that work in the shop's IANA timezone without extra dependencies. */

export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
] as const;

export function weekdayName(weekday: number): string {
  return WEEKDAYS.find((d) => d.value === weekday)?.long ?? "";
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function listTimeZones(): string[] {
  return Intl.supportedValuesOf("timeZone");
}

/** "HH:MM" or "HH:MM:SS" → minutes since midnight. */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Normalizes Postgres `time` values ("09:00:00") to "09:00". */
export function shortTime(value: string): string {
  return value.slice(0, 5);
}

/** The wall-clock weekday and minutes-since-midnight for `at` in `timeZone`. */
export function zonedNow(timeZone: string, at: Date = new Date()): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export type Interval = { opensAt: string; closesAt: string };

/** Open/closed status for display, such as "Open until 19:00" or "Closed · opens Tue 09:00". */
export function openStatus(
  hours: Array<Interval & { weekday: number }>,
  timeZone: string,
  at: Date = new Date(),
): { open: boolean; label: string } {
  const { weekday, minutes } = zonedNow(timeZone, at);
  const today = hours
    .filter((h) => h.weekday === weekday)
    .sort((a, b) => timeToMinutes(a.opensAt) - timeToMinutes(b.opensAt));
  const current = today.find((h) => timeToMinutes(h.opensAt) <= minutes && minutes < timeToMinutes(h.closesAt));
  if (current) return { open: true, label: `Open until ${shortTime(current.closesAt)}` };

  const laterToday = today.find((h) => timeToMinutes(h.opensAt) > minutes);
  if (laterToday) return { open: false, label: `Closed · opens ${shortTime(laterToday.opensAt)}` };

  for (let i = 1; i <= 7; i++) {
    const day = (weekday + i) % 7;
    const first = hours
      .filter((h) => h.weekday === day)
      .sort((a, b) => timeToMinutes(a.opensAt) - timeToMinutes(b.opensAt))[0];
    if (first) {
      const dayLabel = i === 1 ? "tomorrow" : weekdayName(day).slice(0, 3);
      return { open: false, label: `Closed · opens ${dayLabel} ${shortTime(first.opensAt)}` };
    }
  }
  return { open: false, label: "No opening hours set" };
}

/* ------------------------------------------------------------------------ */
/* Calendar dates ("YYYY-MM-DD") and wall-clock ↔ instant conversion         */
/* ------------------------------------------------------------------------ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function dateToUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcMsToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return utcMsToDate(dateToUtcMs(date) + days * 86_400_000);
}

/** 0 = Sunday … 6 = Saturday, for a calendar date (independent of any time zone). */
export function weekdayOf(date: string): number {
  return new Date(dateToUtcMs(date)).getUTCDay();
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: string, months: number): string {
  const [y, m] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  return utcMsToDate(dt.getTime());
}

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(at: Date, timeZone: string): { date: string; minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return { date, minutes: Number(get("hour")) * 60 + Number(get("minute")), weekday: weekdayOf(date) };
}

/** The calendar date of `at` in the shop's time zone. */
export function zonedDate(at: Date, timeZone: string): string {
  return zonedParts(at, timeZone).date;
}

function offsetMs(atMs: number, timeZone: string): number {
  const { date, minutes } = zonedParts(new Date(atMs), timeZone);
  const seconds = new Date(atMs).getUTCSeconds() * 1000 + new Date(atMs).getUTCMilliseconds();
  return dateToUtcMs(date) + minutes * 60_000 + seconds - atMs;
}

/**
 * The instant at which the wall clock in `timeZone` shows `date` + `minutes`.
 * Returns null for wall times that don't exist (the gap when clocks spring forward).
 */
export function zonedTimeToUtc(date: string, minutes: number, timeZone: string): Date | null {
  const wall = dateToUtcMs(date) + minutes * 60_000;
  let guess = wall - offsetMs(wall, timeZone);
  guess = wall - offsetMs(guess, timeZone);
  const check = zonedParts(new Date(guess), timeZone);
  if (check.date !== date || check.minutes !== ((minutes % 1440) + 1440) % 1440) {
    // `minutes` may be 1440 (midnight at the end of the day), which is the next date.
    if (!(minutes === 1440 && check.date === addDays(date, 1) && check.minutes === 0)) return null;
  }
  return new Date(guess);
}

/** "HH:MM" for an instant, in the shop's time zone. */
export function formatClock(at: Date, timeZone: string): string {
  return minutesToTime(zonedParts(at, timeZone).minutes);
}

export function formatDateLabel(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(dateToUtcMs(date)));
}
