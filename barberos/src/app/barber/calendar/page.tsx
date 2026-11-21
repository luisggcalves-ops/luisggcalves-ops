import type { Metadata } from "next";
import { requirePageContext } from "@/server/tenancy";
import { getOwnStaffProfile } from "@/server/domain/shops/service";
import { listAppointments } from "@/server/domain/appointments/service";
import { AgendaList } from "@/components/appointments/agenda-list";
import { addDays, formatDateLabel, zonedDate, zonedTimeToUtc } from "@/lib/time";

export const metadata: Metadata = { title: "Calendar" };

const DAYS = 14;

export default async function BarberCalendarPage() {
  const ctx = await requirePageContext("barber_app.view");
  const profile = await getOwnStaffProfile(ctx);
  const tz = ctx.shop.timezone;
  const today = zonedDate(new Date(), tz);
  const appts = profile
    ? await listAppointments(ctx, {
        from: zonedTimeToUtc(today, 0, tz)!,
        to: zonedTimeToUtc(addDays(today, DAYS), 0, tz)!,
        staffMemberId: profile.id,
      })
    : [];
  const byDay = new Map<string, typeof appts>();
  for (const a of appts) {
    const d = zonedDate(a.startsAt, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Next {DAYS} days</h1>
        <p className="mt-0.5 text-[13px] text-fg-muted">
          {appts.length} appointment{appts.length === 1 ? "" : "s"}
        </p>
      </div>
      {byDay.size === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-fg-muted">
          Nothing booked yet.
        </p>
      ) : (
        [...byDay.entries()].map(([d, items]) => (
          <section key={d} className="flex flex-col gap-2">
            <h2 className="text-[13px] font-medium text-fg-muted">
              {d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : formatDateLabel(d, { weekday: "long", day: "numeric", month: "short" })}
            </h2>
            <AgendaList items={items} timeZone={tz} hrefFor={(id) => `/barber/appointments/${id}`} />
          </section>
        ))
      )}
    </div>
  );
}
