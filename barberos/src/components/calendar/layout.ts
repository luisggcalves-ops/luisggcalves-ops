import { timeToMinutes, zonedParts, zonedTimeToUtc, addDays } from "@/lib/time";

export type MinuteRange = { start: number; end: number; label?: string };

export type GridEvent = {
  id: string;
  start: number; // minutes since local midnight
  end: number;
  title: string;
  subtitle: string;
  status: string;
  color: string;
  href: string;
};

export type GridColumn = {
  key: string;
  label: string;
  sublabel?: string;
  date: string;
  isToday: boolean;
  /** Where clicking an empty slot books an appointment, with `{time}` replaced. Null disables it. */
  bookHref: string | null;
  available: MinuteRange[];
  blocked: MinuteRange[];
  events: GridEvent[];
};

/** Minutes since local midnight on `date` for an instant, clamped to the day. */
export function minutesOnDate(at: Date, date: string, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  if (p.date < date) return 0;
  if (p.date > date) return 24 * 60;
  return p.minutes;
}

/** Clamps an instant range to a calendar day and converts to minutes. */
export function rangeOnDate(start: Date, end: Date, date: string, timeZone: string): MinuteRange | null {
  const dayStart = zonedTimeToUtc(date, 0, timeZone);
  const dayEnd = zonedTimeToUtc(addDays(date, 1), 0, timeZone);
  if (!dayStart || !dayEnd || end <= dayStart || start >= dayEnd) return null;
  return { start: minutesOnDate(start, date, timeZone), end: minutesOnDate(end, date, timeZone) || 24 * 60 };
}

export function intersectMinutes(a: MinuteRange[], b: MinuteRange[]): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const x of a) for (const y of b) {
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
  }
  return out.sort((p, q) => p.start - q.start);
}

export function hoursToRanges(rows: { from: string; to: string }[]): MinuteRange[] {
  return rows.map((r) => ({ start: timeToMinutes(r.from), end: timeToMinutes(r.to) })).sort((a, b) => a.start - b.start);
}

/** The visible hour range: covers all working time and events, rounded to whole hours. */
export function visibleHours(columns: GridColumn[]): { startMin: number; endMin: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const c of columns) {
    for (const r of [...c.available, ...c.events]) {
      min = Math.min(min, r.start);
      max = Math.max(max, r.end);
    }
  }
  if (!Number.isFinite(min)) return { startMin: 9 * 60, endMin: 19 * 60 };
  return { startMin: Math.max(0, Math.floor(min / 60) * 60), endMin: Math.min(24 * 60, Math.ceil(max / 60) * 60) };
}

/**
 * Side-by-side layout for overlapping events in one column (for example, several
 * barbers in the week view). Each event gets a lane index and the lane count of its cluster.
 */
export function layoutLanes<T extends { start: number; end: number }>(events: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number; lanes: number })[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((e) => e.lane + 1));
    cluster.forEach((e) => (e.lanes = lanes));
    out.push(...cluster);
    cluster = [];
  };
  for (const ev of sorted) {
    if (ev.start >= clusterEnd && cluster.length) flush();
    const laneEnds: number[] = [];
    for (const c of cluster) laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? -Infinity, c.end);
    let lane = laneEnds.findIndex((end) => end <= ev.start);
    if (lane === -1) lane = laneEnds.length;
    cluster.push({ ...ev, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, ev.end);
  }
  if (cluster.length) flush();
  return out;
}
