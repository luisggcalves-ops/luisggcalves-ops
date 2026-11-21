import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getOpeningHours, getOwnStaffProfile } from "@/server/domain/shops/service";
import { listAppointments } from "@/server/domain/appointments/service";
import { Card, CardBody } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { AgendaList } from "@/components/appointments/agenda-list";
import { addDays, openStatus, shortTime, zonedDate, zonedNow, zonedTimeToUtc } from "@/lib/time";
import { cn } from "@/lib/cn";

export default async function BarberTodayPage() {
  const ctx = await requirePageContext("barber_app.view");
  const [hours, profile] = await Promise.all([getOpeningHours(ctx), getOwnStaffProfile(ctx)]);
  const now = new Date();
  const tz = ctx.shop.timezone;
  const today = zonedDate(now, tz);
  const { weekday } = zonedNow(tz, now);
  const status = openStatus(hours, tz, now);
  const todayHours = hours.filter((h) => h.weekday === weekday);
  const dateLabel = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now);

  const appts = profile
    ? await listAppointments(ctx, {
        from: zonedTimeToUtc(today, 0, tz)!,
        to: zonedTimeToUtc(addDays(today, 1), 0, tz)!,
        staffMemberId: profile.id,
        includeCancelled: true,
      })
    : [];
  const live = appts.filter((a) => a.status === "pending" || a.status === "confirmed");
  const next = live.find((a) => a.endsAt > now) ?? null;
  const done = appts.filter((a) => a.status === "completed").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[13px] text-fg-muted">{dateLabel}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Hi, {ctx.user.name.split(" ")[0]}</h1>
        </div>
        {profile ? (
          <Link href="/barber/new" className={buttonClass("primary", "sm")}>
            <Plus className="size-4" /> Book
          </Link>
        ) : null}
      </div>

      <Card>
        <CardBody className="grid grid-cols-3 divide-x divide-border p-0">
          <div className="px-4 py-3">
            <p className="text-[12px] text-fg-muted">Shop</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-semibold">
              <span className={cn("size-2 rounded-full", status.open ? "bg-success" : "bg-fg-subtle")} aria-hidden />
              {status.open ? "Open" : "Closed"}
            </p>
            <p className="truncate text-[11px] text-fg-muted tabular">
              {todayHours.length ? todayHours.map((h) => `${shortTime(h.opensAt)}–${shortTime(h.closesAt)}`).join(", ") : "Closed today"}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[12px] text-fg-muted">Booked</p>
            <p className="mt-0.5 text-lg font-semibold tabular">{live.length + done}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[12px] text-fg-muted">Done</p>
            <p className="mt-0.5 text-lg font-semibold tabular">{done}</p>
          </div>
        </CardBody>
      </Card>

      {!profile ? (
        <Card>
          <CardBody className="py-10 text-center">
            <p className="font-medium">You don&apos;t have a barber profile here</p>
            <p className="mt-1 text-[13px] text-fg-muted">Ask the owner to add one if you should take bookings.</p>
          </CardBody>
        </Card>
      ) : appts.length ? (
        <>
          {next ? <p className="text-[13px] font-medium text-fg-muted">Up next</p> : null}
          <AgendaList items={appts} timeZone={tz} hrefFor={(id) => `/barber/appointments/${id}`} highlightId={next?.id} />
        </>
      ) : (
        <Card>
          <CardBody className="flex flex-col items-center py-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-surface-muted">
              <CalendarClock className="size-6 text-fg-muted" strokeWidth={1.5} />
            </span>
            <p className="mt-4 font-medium">No appointments today</p>
            <p className="mt-1 max-w-xs text-[13px] text-fg-muted">Walk-ins can be added with the Book button.</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
