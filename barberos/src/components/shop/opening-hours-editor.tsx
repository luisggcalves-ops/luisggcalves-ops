"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { WEEKDAYS, timeToMinutes, minutesToTime } from "@/lib/time";
import type { OpeningInterval } from "@/lib/validation/shop";
import { cn } from "@/lib/cn";

type Day = { open: boolean; intervals: { opensAt: string; closesAt: string }[] };

function toDays(value: OpeningInterval[]): Record<number, Day> {
  const days: Record<number, Day> = {};
  for (const { value: wd } of WEEKDAYS) {
    const intervals = value
      .filter((v) => v.weekday === wd)
      .sort((a, b) => timeToMinutes(a.opensAt) - timeToMinutes(b.opensAt))
      .map(({ opensAt, closesAt }) => ({ opensAt, closesAt }));
    days[wd] = intervals.length
      ? { open: true, intervals }
      : { open: false, intervals: [{ opensAt: "09:00", closesAt: "19:00" }] };
  }
  return days;
}

function fromDays(days: Record<number, Day>): OpeningInterval[] {
  return WEEKDAYS.flatMap(({ value: wd }) =>
    days[wd].open ? days[wd].intervals.map((iv) => ({ weekday: wd, ...iv })) : [],
  );
}

function dayError(day: Day): string | null {
  if (!day.open) return null;
  const sorted = [...day.intervals].sort((a, b) => timeToMinutes(a.opensAt) - timeToMinutes(b.opensAt));
  for (let i = 0; i < sorted.length; i++) {
    if (timeToMinutes(sorted[i].closesAt) <= timeToMinutes(sorted[i].opensAt)) return "Closing time must be after opening time";
    if (i > 0 && timeToMinutes(sorted[i].opensAt) < timeToMinutes(sorted[i - 1].closesAt)) return "Times overlap";
  }
  return null;
}

/**
 * Weekly opening-hours editor. It submits the whole week as JSON in a hidden
 * input named `name`. Split shifts (a lunch break, for example) are separate intervals on the same day.
 */
export function OpeningHoursEditor({ name, defaultValue }: { name: string; defaultValue: OpeningInterval[] }) {
  const [days, setDays] = useState(() => toDays(defaultValue));
  const serialized = useMemo(() => JSON.stringify(fromDays(days)), [days]);

  const update = (wd: number, fn: (d: Day) => Day) => setDays((prev) => ({ ...prev, [wd]: fn(prev[wd]) }));

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      <input type="hidden" name={name} value={serialized} />
      {WEEKDAYS.map(({ value: wd, long }) => {
        const day = days[wd];
        const err = dayError(day);
        return (
          <div key={wd} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start">
            <label className="flex w-32 shrink-0 cursor-pointer items-center gap-3 pt-1.5 text-sm font-medium">
              <span
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                  day.open ? "bg-primary" : "bg-border-strong",
                )}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={day.open}
                  onChange={(e) => update(wd, (d) => ({ ...d, open: e.target.checked }))}
                  aria-label={`Open on ${long}`}
                />
                <span
                  className={cn(
                    "absolute left-0.5 size-4 rounded-full bg-surface shadow transition-transform",
                    day.open && "translate-x-4",
                  )}
                />
              </span>
              {long}
            </label>
            <div className="flex flex-1 flex-col gap-2">
              {day.open ? (
                day.intervals.map((iv, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="time"
                      step={900}
                      value={iv.opensAt}
                      aria-label={`${long} opens at`}
                      onChange={(e) =>
                        update(wd, (d) => ({
                          ...d,
                          intervals: d.intervals.map((x, i) => (i === idx ? { ...x, opensAt: e.target.value } : x)),
                        }))
                      }
                      className="h-9 w-[104px] rounded-lg border border-border-strong bg-surface px-2 text-sm tabular focus:border-fg focus:outline-none"
                    />
                    <span className="text-fg-subtle">–</span>
                    <input
                      type="time"
                      step={900}
                      value={iv.closesAt}
                      aria-label={`${long} closes at`}
                      onChange={(e) =>
                        update(wd, (d) => ({
                          ...d,
                          intervals: d.intervals.map((x, i) => (i === idx ? { ...x, closesAt: e.target.value } : x)),
                        }))
                      }
                      className="h-9 w-[104px] rounded-lg border border-border-strong bg-surface px-2 text-sm tabular focus:border-fg focus:outline-none"
                    />
                    {day.intervals.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => update(wd, (d) => ({ ...d, intervals: d.intervals.filter((_, i) => i !== idx) }))}
                        className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg"
                        aria-label={`Remove ${long} interval`}
                      >
                        <X className="size-4" />
                      </button>
                    ) : null}
                    {idx === day.intervals.length - 1 && day.intervals.length < 4 ? (
                      <button
                        type="button"
                        onClick={() =>
                          update(wd, (d) => {
                            const last = d.intervals[d.intervals.length - 1];
                            const start = Math.min(timeToMinutes(last.closesAt) + 60, 23 * 60);
                            const end = Math.min(start + 120, 23 * 60 + 45);
                            return {
                              ...d,
                              intervals: [...d.intervals, { opensAt: minutesToTime(start), closesAt: minutesToTime(end) }],
                            };
                          })
                        }
                        className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg"
                        aria-label={`Add a break on ${long}`}
                        title="Split the day (e.g. a lunch break)"
                      >
                        <Plus className="size-4" />
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="pt-1.5 text-sm text-fg-subtle">Closed</p>
              )}
              {err ? (
                <p role="alert" className="text-[13px] text-danger">
                  {err}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
