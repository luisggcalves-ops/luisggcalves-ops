import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { AppointmentListItem } from "@/server/domain/appointments/service";
import { formatClock } from "@/lib/time";
import { colorHex } from "@/lib/calendar-colors";
import { cn } from "@/lib/cn";
import { StatusBadge } from "./status-badge";

/** A compact list of appointments for phones. */
export function AgendaList({
  items,
  timeZone,
  hrefFor,
  highlightId,
}: {
  items: AppointmentListItem[];
  timeZone: string;
  hrefFor: (id: string) => string;
  highlightId?: string | null;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {items.map((a) => (
        <li key={a.id}>
          <Link
            href={hrefFor(a.id)}
            className={cn("flex items-center gap-3 px-4 py-3 active:bg-surface-muted", a.id === highlightId && "bg-surface-muted/60")}
          >
            <span className="w-12 shrink-0 text-right">
              <span className="block text-[15px] font-semibold tabular">{formatClock(a.startsAt, timeZone)}</span>
              <span className="block text-[11px] text-fg-subtle tabular">{formatClock(a.endsAt, timeZone)}</span>
            </span>
            <span className="h-9 w-[3px] shrink-0 rounded-full" style={{ background: colorHex(a.calendarColor) }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate font-medium", (a.status === "cancelled" || a.status === "no_show") && "line-through text-fg-muted")}>
                {a.customerName}
              </span>
              <span className="block truncate text-[13px] text-fg-muted">{a.serviceName}</span>
            </span>
            {a.status !== "confirmed" ? <StatusBadge status={a.status} /> : null}
            <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
