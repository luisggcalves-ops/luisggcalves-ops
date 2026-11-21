import { Clock, Phone, Mail, Scissors, User } from "lucide-react";
import type { getAppointment } from "@/server/domain/appointments/service";
import { allowedTransitions } from "@/server/domain/appointments/service";
import { formatClock, formatDateLabel, zonedDate } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { StatusBadge, STATUS_LABEL } from "./status-badge";
import { NotesForm, RescheduleForm, StatusActions } from "./appointment-actions";
import type { AppointmentStatus } from "@/server/db/schema";

type Details = Awaited<ReturnType<typeof getAppointment>>;

function describeEvent(e: Details["events"][number], tz: string): string {
  const to = (e.toValue ?? {}) as Record<string, unknown>;
  const from = (e.fromValue ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case "created":
      return "Booked";
    case "status_changed":
      return `${STATUS_LABEL[from.status as AppointmentStatus] ?? from.status} → ${STATUS_LABEL[to.status as AppointmentStatus] ?? to.status}${to.reason ? ` (“${to.reason}”)` : ""}`;
    case "rescheduled": {
      const f = from.startsAt ? new Date(String(from.startsAt)) : null;
      const t = to.startsAt ? new Date(String(to.startsAt)) : null;
      return `Moved${f ? ` from ${formatDateLabel(zonedDate(f, tz), { day: "numeric", month: "short" })} ${formatClock(f, tz)}` : ""}${t ? ` to ${formatDateLabel(zonedDate(t, tz), { day: "numeric", month: "short" })} ${formatClock(t, tz)}` : ""}`;
    }
    case "edited":
      return "Note updated";
  }
}

/** The full appointment view used by the dashboard drawer and the barber app. */
export function AppointmentDetails({
  data,
  timeZone,
  currency,
  staff,
  now,
}: {
  data: Details;
  timeZone: string;
  currency: string;
  staff: { id: string; displayName: string }[];
  now: Date;
}) {
  const a = data.appointment;
  const date = zonedDate(a.startsAt, timeZone);
  const active = a.status === "pending" || a.status === "confirmed";
  const allowed = allowedTransitions(a.status) as ("confirmed" | "completed" | "cancelled" | "no_show")[];
  const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <StatusBadge status={a.status} />
          {a.source === "walk_in" ? <span className="text-[12px] text-fg-muted">Walk-in</span> : null}
          {a.source === "online" ? <span className="text-[12px] text-fg-muted">Booked online</span> : null}
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{data.customer.fullName}</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          {formatDateLabel(date)} · <span className="tabular">{formatClock(a.startsAt, timeZone)}–{formatClock(a.endsAt, timeZone)}</span>
        </p>
      </div>

      <dl className="grid grid-cols-[20px_1fr] items-center gap-x-3 gap-y-2.5 text-sm">
        <Scissors className="size-4 text-fg-subtle" aria-hidden />
        <dd>
          {a.serviceName} · {a.durationMin} min · <span className="tabular">{formatMoney(a.priceCents, currency)}</span>
        </dd>
        <User className="size-4 text-fg-subtle" aria-hidden />
        <dd>with {data.staffName}</dd>
        {data.customer.phoneE164 ? (
          <>
            <Phone className="size-4 text-fg-subtle" aria-hidden />
            <dd>
              <a href={`tel:${data.customer.phoneE164}`} className="hover:underline">
                {formatPhone(data.customer.phoneE164)}
              </a>
            </dd>
          </>
        ) : null}
        {data.customer.email ? (
          <>
            <Mail className="size-4 text-fg-subtle" aria-hidden />
            <dd className="truncate">
              <a href={`mailto:${data.customer.email}`} className="hover:underline">
                {data.customer.email}
              </a>
            </dd>
          </>
        ) : null}
        <Clock className="size-4 text-fg-subtle" aria-hidden />
        <dd className="text-fg-muted">
          {data.customer.visitCount ? `${data.customer.visitCount} completed visit${data.customer.visitCount > 1 ? "s" : ""}` : "First visit"}
        </dd>
      </dl>

      {a.cancelReason ? (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">Cancellation reason: {a.cancelReason}</p>
      ) : null}

      <StatusActions appointmentId={a.id} version={a.version} allowed={allowed} started={a.startsAt <= now} />

      {active ? (
        <RescheduleForm
          appointmentId={a.id}
          version={a.version}
          serviceId={a.serviceId}
          staff={staff}
          canManageAll={data.canManageAll}
          defaults={{ staffMemberId: a.staffMemberId, date, time: formatClock(a.startsAt, timeZone) }}
        />
      ) : null}

      <NotesForm appointmentId={a.id} note={a.internalNote ?? ""} />

      <div>
        <h3 className="text-[13px] font-medium">History</h3>
        <ol className="mt-2 flex flex-col gap-2 border-l border-border pl-4">
          {data.events.map((e) => (
            <li key={e.id} className="text-[13px]">
              <span className="text-fg">{describeEvent(e, timeZone)}</span>
              <span className="block text-[12px] text-fg-subtle">{dateTimeFmt.format(e.createdAt)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
