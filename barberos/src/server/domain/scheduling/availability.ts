/**
 * Availability engine: pure functions, no database access.
 *
 * A barber is available when all of these hold:
 *   - the shop is open (opening hours, no closure that day)
 *   - the barber is working (weekly working hours)
 *   - the barber is not on time off
 *   - the slot doesn't overlap another pending/confirmed appointment (including its buffer)
 *
 * The service itself must fit inside open/working time. Its buffer (clean-up) only has to
 * avoid other bookings. All interval maths happens on UTC instants (ms), so daylight-saving
 * changes are handled. Slots are generated on the shop's wall-clock grid (09:00, 09:15, …).
 * The database exclusion constraint has the final say. This engine only proposes.
 */
import { timeToMinutes, weekdayOf, zonedTimeToUtc } from "@/lib/time";

export type Range = { start: number; end: number }; // epoch ms, half-open [start, end)

export type DayAvailabilityInput = {
  date: string; // YYYY-MM-DD in the shop's time zone
  timeZone: string;
  shopHours: { weekday: number; opensAt: string; closesAt: string }[];
  staffHours: { weekday: number; startsAt: string; endsAt: string }[];
  closures: { startsOn: string; endsOn: string }[];
  timeOff: { startsAt: Date; endsAt: Date }[];
  /** Existing active appointments for the barber: [startsAt, blockedUntil). */
  busy: { startsAt: Date; blockedUntil: Date }[];
};

export type SlotQuery = {
  durationMin: number;
  bufferMin: number;
  slotIntervalMin: number;
  /** Earliest allowed start (now + lead time). */
  notBefore?: Date;
  /** Latest allowed start (booking horizon). */
  notAfter?: Date;
};

/* ---------------------------- interval helpers --------------------------- */

export function normalize(ranges: Range[]): Range[] {
  const sorted = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

export function intersect(a: Range[], b: Range[]): Range[] {
  const out: Range[] = [];
  for (const x of normalize(a)) {
    for (const y of normalize(b)) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) out.push({ start, end });
    }
  }
  return normalize(out);
}

export function subtract(a: Range[], b: Range[]): Range[] {
  let result = normalize(a);
  for (const cut of normalize(b)) {
    const next: Range[] = [];
    for (const r of result) {
      if (cut.end <= r.start || cut.start >= r.end) {
        next.push(r);
        continue;
      }
      if (cut.start > r.start) next.push({ start: r.start, end: cut.start });
      if (cut.end < r.end) next.push({ start: cut.end, end: r.end });
    }
    result = next;
  }
  return result;
}

function contains(ranges: Range[], start: number, end: number) {
  return ranges.some((r) => r.start <= start && end <= r.end);
}

function overlapsAny(ranges: Range[], start: number, end: number) {
  return ranges.some((r) => r.start < end && start < r.end);
}

/* ------------------------------ the engine ------------------------------- */

function wallRanges(date: string, timeZone: string, rows: { from: string; to: string }[]): Range[] {
  const out: Range[] = [];
  for (const row of rows) {
    const start = zonedTimeToUtc(date, timeToMinutes(row.from), timeZone);
    const end = zonedTimeToUtc(date, timeToMinutes(row.to), timeZone);
    if (start && end) out.push({ start: start.getTime(), end: end.getTime() });
  }
  return normalize(out);
}

/** Time the barber can be serving customers that day: open ∩ working − closures − time off. */
export function workableRanges(input: DayAvailabilityInput): Range[] {
  const weekday = weekdayOf(input.date);
  if (input.closures.some((c) => c.startsOn <= input.date && input.date <= c.endsOn)) return [];
  const open = wallRanges(
    input.date,
    input.timeZone,
    input.shopHours.filter((h) => h.weekday === weekday).map((h) => ({ from: h.opensAt, to: h.closesAt })),
  );
  const working = wallRanges(
    input.date,
    input.timeZone,
    input.staffHours.filter((h) => h.weekday === weekday).map((h) => ({ from: h.startsAt, to: h.endsAt })),
  );
  const off = input.timeOff.map((t) => ({ start: t.startsAt.getTime(), end: t.endsAt.getTime() }));
  return subtract(intersect(open, working), off);
}

function busyRanges(input: DayAvailabilityInput): Range[] {
  return normalize(input.busy.map((b) => ({ start: b.startsAt.getTime(), end: b.blockedUntil.getTime() })));
}

export type SlotCheck =
  | { ok: true }
  | { ok: false; reason: "OUTSIDE_HOURS" | "TAKEN" | "TOO_SOON" | "TOO_FAR" };

/** Whether one specific start time works. Used to validate bookings made by staff and customers. */
export function checkSlot(input: DayAvailabilityInput, query: SlotQuery, start: Date): SlotCheck {
  const s = start.getTime();
  const serviceEnd = s + query.durationMin * 60_000;
  const blockedEnd = serviceEnd + query.bufferMin * 60_000;
  if (query.notBefore && s < query.notBefore.getTime()) return { ok: false, reason: "TOO_SOON" };
  if (query.notAfter && s > query.notAfter.getTime()) return { ok: false, reason: "TOO_FAR" };
  if (!contains(workableRanges(input), s, serviceEnd)) return { ok: false, reason: "OUTSIDE_HOURS" };
  if (overlapsAny(busyRanges(input), s, blockedEnd)) return { ok: false, reason: "TAKEN" };
  return { ok: true };
}

/** All bookable start times for the day, on the shop's wall-clock grid. */
export function availableSlots(input: DayAvailabilityInput, query: SlotQuery): Date[] {
  const workable = workableRanges(input);
  if (!workable.length) return [];
  const busy = busyRanges(input);
  const slots: Date[] = [];
  const step = Math.max(5, query.slotIntervalMin);
  for (let m = 0; m < 24 * 60; m += step) {
    const start = zonedTimeToUtc(input.date, m, input.timeZone);
    if (!start) continue; // the wall time doesn't exist (DST gap)
    const s = start.getTime();
    const serviceEnd = s + query.durationMin * 60_000;
    const blockedEnd = serviceEnd + query.bufferMin * 60_000;
    if (query.notBefore && s < query.notBefore.getTime()) continue;
    if (query.notAfter && s > query.notAfter.getTime()) continue;
    if (!contains(workable, s, serviceEnd)) continue;
    if (overlapsAny(busy, s, blockedEnd)) continue;
    slots.push(start);
  }
  return slots;
}
