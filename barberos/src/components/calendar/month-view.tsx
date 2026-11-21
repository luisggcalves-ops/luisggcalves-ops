import Link from "next/link";
import { addDays, formatClock } from "@/lib/time";
import { cn } from "@/lib/cn";

export type MonthDay = {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  closed: boolean;
  href: string;
  items: { id: string; startsAt: Date; title: string; color: string; status: string }[];
};

export function MonthView({ days, timeZone }: { days: MonthDay[]; timeZone: string }) {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-border">
        {weekdays.map((d) => (
          <div key={d} className="px-3 py-2 text-[12px] font-medium uppercase tracking-wider text-fg-subtle">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const active = d.items.filter((x) => x.status !== "cancelled");
          return (
            <Link
              key={d.date}
              href={d.href}
              className={cn(
                "flex min-h-24 flex-col gap-1 border-border p-2 transition-colors hover:bg-surface-muted/60 sm:min-h-28",
                i % 7 !== 0 && "border-l",
                i >= 7 && "border-t",
                !d.inMonth && "bg-surface-muted/40 text-fg-subtle",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[12px] tabular",
                    d.isToday && "bg-primary font-semibold text-primary-fg",
                  )}
                >
                  {Number(d.date.slice(8))}
                </span>
                {active.length ? <span className="text-[11px] text-fg-muted tabular">{active.length}</span> : null}
              </div>
              {d.closed ? <span className="text-[11px] text-fg-subtle">Closed</span> : null}
              <ul className="hidden flex-col gap-0.5 sm:flex">
                {active.slice(0, 3).map((x) => (
                  <li key={x.id} className="flex items-center gap-1.5 truncate text-[11px]">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: x.color }} />
                    <span className="tabular text-fg-muted">{formatClock(x.startsAt, timeZone)}</span>
                    <span className="truncate">{x.title}</span>
                  </li>
                ))}
                {active.length > 3 ? <li className="text-[11px] text-fg-muted">+{active.length - 3} more</li> : null}
              </ul>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function monthGridDates(monthStart: string, weekStart: string): string[] {
  return Array.from({ length: 42 }, (_, i) => addDays(weekStart, i)).filter((_, i, arr) => {
    // Drop the last row if it is entirely in the next month.
    if (i < 35) return true;
    return arr[35].slice(0, 7) === monthStart.slice(0, 7);
  });
}
