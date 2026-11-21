import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDateLabel } from "@/lib/time";

/** A horizontal strip of dates (greyed when nothing is free) and the free times for the chosen date. */
export function DateTimes({
  days,
  selected,
  dateHref,
  timeHref,
  selectedTime,
}: {
  days: { date: string; times: string[] }[];
  selected: string;
  dateHref: (date: string) => string;
  timeHref: (time: string) => string;
  selectedTime?: string;
}) {
  const current = days.find((d) => d.date === selected);
  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2 pb-1" aria-label="Dates">
          {days.map((d) => {
            const isSel = d.date === selected;
            const has = d.times.length > 0;
            const inner = (
              <>
                <span className="text-[11px] uppercase tracking-wider">{formatDateLabel(d.date, { weekday: "short" })}</span>
                <span className="text-lg font-semibold tabular">{Number(d.date.slice(8))}</span>
                <span className="text-[10px]">{formatDateLabel(d.date, { month: "short" })}</span>
              </>
            );
            return (
              <li key={d.date}>
                {has ? (
                  <Link
                    href={dateHref(d.date)}
                    scroll={false}
                    aria-current={isSel ? "date" : undefined}
                    className={cn(
                      "flex w-14 flex-col items-center rounded-xl border py-2 transition-colors",
                      isSel ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface hover:border-fg",
                    )}
                  >
                    {inner}
                  </Link>
                ) : (
                  <span aria-disabled className="flex w-14 flex-col items-center rounded-xl border border-border py-2 text-fg-subtle opacity-50">
                    {inner}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {current && current.times.length ? (
        <div>
          <p className="mb-2 text-[13px] text-fg-muted">{formatDateLabel(current.date)}</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {current.times.map((t) => (
              <Link
                key={t}
                href={timeHref(t)}
                className={cn(
                  "grid h-11 place-items-center rounded-xl border text-[15px] font-medium tabular transition-colors",
                  selectedTime === t ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface hover:border-fg",
                )}
              >
                {t}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-fg-muted">
          No free times in this period. Try other dates or another barber.
        </p>
      )}
    </div>
  );
}
