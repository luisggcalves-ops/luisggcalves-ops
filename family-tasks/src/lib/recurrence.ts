import type { RecurrenceFreq } from "./types";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface RecurrenceLike {
  recurrence_freq: RecurrenceFreq | null;
  recurrence_interval: number;
  recurrence_weekdays: number[];
}

/** Human readable label, e.g. "Every Tuesday", "Every 2 weeks on Mon, Thu". */
export function describeRecurrence(r: RecurrenceLike): string | null {
  if (!r.recurrence_freq) return null;
  const n = Math.max(1, r.recurrence_interval || 1);
  const days = [...(r.recurrence_weekdays ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));

  switch (r.recurrence_freq) {
    case "daily":
      return n === 1 ? "Every day" : `Every ${n} days`;
    case "monthly":
      return n === 1 ? "Every month" : `Every ${n} months`;
    case "weekly": {
      if (days.length === 7 && n === 1) return "Every day";
      const isWeekdays = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
      if (isWeekdays && n === 1) return "Every weekday";
      const isWeekend = days.length === 2 && days.includes(0) && days.includes(6);
      if (isWeekend && n === 1) return "Every weekend";
      if (days.length === 0) return n === 1 ? "Every week" : `Every ${n} weeks`;
      if (n === 1 && days.length === 1) return `Every ${DAY_NAMES[days[0]]}`;
      const list = days.map((d) => SHORT[d]).join(", ");
      return n === 1 ? `Every ${list}` : `Every ${n} weeks on ${list}`;
    }
  }
}

/**
 * When a weekly rule lists specific weekdays, the first occurrence should land
 * on one of them. Returns the first date >= `date` whose weekday is allowed.
 */
export function alignToWeekdays(date: Date, weekdays: number[]): Date {
  if (!weekdays.length) return date;
  const d = new Date(date);
  for (let i = 0; i < 7; i++) {
    if (weekdays.includes(d.getDay())) return d;
    d.setDate(d.getDate() + 1);
  }
  return date;
}
