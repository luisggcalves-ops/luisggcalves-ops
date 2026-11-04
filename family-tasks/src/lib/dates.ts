import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isToday,
  isTomorrow,
  isYesterday,
  startOfWeek,
  endOfWeek,
} from "date-fns";

export const weekStart = (d = new Date()) => startOfWeek(d, { weekStartsOn: 1 });
export const weekEnd = (d = new Date()) => endOfWeek(d, { weekStartsOn: 1 });

/** Compact due label: "Today 18:00", "Tomorrow", "Fri", "12 Nov", "2 days overdue". */
export function formatDue(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = format(d, "HH:mm");
  const showTime = time !== "23:59";
  if (isToday(d)) return showTime ? `Today ${time}` : "Today";
  if (isTomorrow(d)) return showTime ? `Tomorrow ${time}` : "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  const diff = differenceInCalendarDays(d, now);
  if (diff > 0 && diff < 7) return format(d, showTime ? "EEE HH:mm" : "EEEE");
  return format(d, d.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy");
}

export function relativeTime(iso: string): string {
  const d = new Date(iso);
  const secs = (Date.now() - d.getTime()) / 1000;
  if (secs < 45) return "just now";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function dayHeading(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, d MMMM");
}

/** Value for <input type="date"> / <input type="time"> from an ISO string. */
export function toDateInput(iso: string | null): string {
  return iso ? format(new Date(iso), "yyyy-MM-dd") : "";
}
export function toTimeInput(iso: string | null): string {
  if (!iso) return "";
  const t = format(new Date(iso), "HH:mm");
  return t === "23:59" ? "" : t;
}
/** Combine local date + optional time into an ISO string (end of day if no time). */
export function fromDateTimeInputs(date: string, time: string): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time ? time.split(":").map(Number) : [23, 59];
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}
