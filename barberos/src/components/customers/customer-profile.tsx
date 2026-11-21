import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import type { getCustomerProfile } from "@/server/domain/customers/crm";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/appointments/status-badge";
import { formatPhone } from "@/lib/phone";
import { formatMoney } from "@/lib/money";
import { formatClock } from "@/lib/time";
import { AddNoteForm, NotesTimeline } from "./notes";

type Profile = Awaited<ReturnType<typeof getCustomerProfile>>;

export function CustomerHeader({ data }: { data: Profile }) {
  const c = data.customer;
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{c.fullName}</h1>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-muted">
        {c.phoneE164 ? (
          <a href={`tel:${c.phoneE164}`} className="inline-flex items-center gap-1.5 hover:text-fg">
            <Phone className="size-3.5" /> {formatPhone(c.phoneE164)}
          </a>
        ) : null}
        {c.email ? (
          <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-fg">
            <Mail className="size-3.5" /> {c.email}
          </a>
        ) : null}
        {data.preferredStaffName ? <span>Prefers {data.preferredStaffName}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Visits" value={String(data.stats.completed)} />
        <Stat label="Upcoming" value={String(data.stats.upcoming)} />
        <Stat label="No-shows" value={String(data.stats.noShows)} />
        <Stat label="Comes every" value={data.stats.avgDaysBetweenVisits ? `${data.stats.avgDaysBetweenVisits} day${data.stats.avgDaysBetweenVisits === 1 ? "" : "s"}` : "–"} />
      </div>
      {c.hairPreferences ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          <span className="block text-[12px] font-medium uppercase tracking-wider text-fg-subtle">Preferences</span>
          {c.hairPreferences}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-[12px] text-fg-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular">{value}</p>
    </div>
  );
}

export function CustomerNotesCard({ data, timeZone, userId, canModerate }: { data: Profile; timeZone: string; userId: string; canModerate: boolean }) {
  return (
    <Card>
      <CardHeader title="Haircut notes" description="What they had and how they like it." />
      <CardBody className="flex flex-col gap-5">
        <AddNoteForm customerId={data.customer.id} />
        <NotesTimeline notes={data.notes} timeZone={timeZone} canDelete={(n) => canModerate || n.authorUserId === userId} />
      </CardBody>
    </Card>
  );
}

export function CustomerHistoryCard({
  data,
  timeZone,
  currency,
  hrefFor,
}: {
  data: Profile;
  timeZone: string;
  currency: string;
  hrefFor: (appointment: { id: string; staffMemberId: string }) => string | null;
}) {
  const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return (
    <Card>
      <CardHeader title="Appointments" description={`${data.history.length} in total`} />
      {data.history.length ? (
        <ul className="divide-y divide-border">
          {data.history.map((h) => {
            const href = hrefFor(h);
            const inner = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {dateFmt.format(h.startsAt)} · <span className="tabular">{formatClock(h.startsAt, timeZone)}</span>
                  </span>
                  <span className="block truncate text-[12px] text-fg-muted">
                    {h.serviceName} with {h.staffName} · {formatMoney(h.priceCents, currency)}
                    {h.source === "online" ? " · booked online" : ""}
                  </span>
                </span>
                <StatusBadge status={h.status} />
              </>
            );
            return (
              <li key={h.id}>
                {href ? (
                  <Link href={href} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted/60">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-3">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <CardBody className="text-sm text-fg-muted">No appointments yet.</CardBody>
      )}
    </Card>
  );
}
