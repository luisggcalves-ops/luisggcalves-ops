import Link from "next/link";
import { minutesToTime } from "@/lib/time";
import { cn } from "@/lib/cn";
import { layoutLanes, visibleHours, type GridColumn } from "./layout";

const PX_PER_MIN = 1.1;
const SLOT_MIN = 30;

/**
 * A time grid (day view: one column per barber; week view: one column per day).
 * Off-hours are hatched, time off and closures are labelled, and empty half-hours
 * are links that open the booking form at that time.
 */
export function TimeGrid({ columns, nowMinutes }: { columns: GridColumn[]; nowMinutes: number | null }) {
  const { startMin, endMin } = visibleHours(columns);
  const height = (endMin - startMin) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);
  const y = (min: number) => (Math.min(Math.max(min, startMin), endMin) - startMin) * PX_PER_MIN;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <div style={{ minWidth: Math.max(560, 64 + columns.length * 150) }}>
        <div className="sticky top-0 z-10 flex border-b border-border bg-surface">
          <div className="w-16 shrink-0" />
          {columns.map((c) => (
            <div key={c.key} className="min-w-0 flex-1 border-l border-border px-3 py-2.5">
              <div className={cn("truncate text-sm font-medium", c.isToday && "text-fg")}>{c.label}</div>
              {c.sublabel ? <div className="truncate text-[12px] text-fg-muted">{c.sublabel}</div> : null}
            </div>
          ))}
        </div>
        <div className="relative flex" style={{ height }}>
          <div className="relative w-16 shrink-0">
            {hours.map((m) => (
              <div key={m} className="absolute right-2 -translate-y-1/2 text-[11px] text-fg-subtle tabular" style={{ top: y(m) }}>
                {m === startMin ? "" : minutesToTime(m)}
              </div>
            ))}
          </div>
          {columns.map((c) => (
            <div key={c.key} className="cal-offhours relative min-w-0 flex-1 border-l border-border" data-testid={`col-${c.key}`}>
              {c.available.map((r, i) => (
                <div key={i} className="absolute inset-x-0 bg-surface" style={{ top: y(r.start), height: y(r.end) - y(r.start) }} />
              ))}
              {hours.map((m) => (
                <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-border/70" style={{ top: y(m) }} />
              ))}
              {c.bookHref
                ? Array.from({ length: Math.ceil((endMin - startMin) / SLOT_MIN) }, (_, i) => startMin + i * SLOT_MIN).map((m) => (
                    <Link
                      key={m}
                      href={c.bookHref!.replace("{time}", minutesToTime(m))}
                      scroll={false}
                      aria-label={`Book ${c.label} at ${minutesToTime(m)}`}
                      className="group absolute inset-x-0 flex items-start px-2 pt-1 text-[11px] text-fg-muted opacity-0 hover:bg-surface-muted/70 hover:opacity-100 focus-visible:opacity-100"
                      style={{ top: y(m), height: SLOT_MIN * PX_PER_MIN }}
                    >
                      + {minutesToTime(m)}
                    </Link>
                  ))
                : null}
              {c.blocked.map((r, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute inset-x-1 flex items-start justify-center rounded-md border border-dashed border-border-strong bg-surface-muted/80 pt-1.5 text-[11px] font-medium text-fg-muted"
                  style={{ top: y(r.start), height: Math.max(18, y(r.end) - y(r.start)) }}
                >
                  {r.label}
                </div>
              ))}
              {layoutLanes(c.events).map((e) => {
                const top = y(e.start);
                const h = Math.max(22, y(e.end) - top - 2);
                return (
                  <Link
                    key={e.id}
                    href={e.href}
                    scroll={false}
                    data-status={e.status}
                    className="appt-block absolute overflow-hidden rounded-md px-2 py-1 text-left shadow-card transition-colors"
                    style={{
                      top: top + 1,
                      height: h,
                      left: `calc(${(e.lane / e.lanes) * 100}% + 3px)`,
                      width: `calc(${100 / e.lanes}% - 6px)`,
                      ["--c" as string]: e.color,
                    }}
                  >
                    <span className="block truncate text-[12px] font-medium leading-tight">{e.title}</span>
                    {h > 30 ? <span className="block truncate text-[11px] leading-tight text-fg-muted">{e.subtitle}</span> : null}
                  </Link>
                );
              })}
              {c.isToday && nowMinutes !== null && nowMinutes >= startMin && nowMinutes <= endMin ? (
                <div className="pointer-events-none absolute inset-x-0 z-[5] flex items-center" style={{ top: y(nowMinutes) }} aria-hidden>
                  <span className="-ml-1 size-2 rounded-full bg-danger" />
                  <span className="h-px flex-1 bg-danger" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
