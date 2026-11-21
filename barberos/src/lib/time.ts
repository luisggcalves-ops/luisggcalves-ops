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
