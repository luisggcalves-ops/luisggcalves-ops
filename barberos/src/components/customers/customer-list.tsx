import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { listCustomers } from "@/server/domain/customers/crm";
import { formatPhone } from "@/lib/phone";

type Rows = Awaited<ReturnType<typeof listCustomers>>["rows"];

export function CustomerList({ rows, timeZone, hrefFor }: { rows: Rows; timeZone: string; hrefFor: (id: string) => string }) {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric" });
  const next = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" });
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {rows.map((c) => (
        <li key={c.id}>
          <Link href={hrefFor(c.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted/60 sm:px-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-[13px] font-semibold">
              {c.fullName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{c.fullName}</span>
              <span className="block truncate text-[12px] text-fg-muted">{[formatPhone(c.phoneE164), c.email].filter(Boolean).join(" · ") || "No contact details"}</span>
            </span>
            <span className="hidden w-28 text-right text-[12px] text-fg-muted sm:block">
              <span className="block tabular">{c.visitCount} visit{c.visitCount === 1 ? "" : "s"}</span>
              <span className="block">{c.lastVisitAt ? `Last ${fmt.format(c.lastVisitAt)}` : "No visits yet"}</span>
            </span>
            <span className="hidden w-28 text-right text-[12px] text-fg-muted md:block">
              {c.nextAppointmentAt ? `Next ${next.format(c.nextAppointmentAt)}` : ""}
            </span>
            <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
