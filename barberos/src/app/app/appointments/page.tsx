import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getAppointment, getBookingOptions, listAppointments } from "@/server/domain/appointments/service";
import { getCalendarContext, type CalendarContext } from "@/server/domain/appointments/calendar";
import { DomainError } from "@/server/errors";
import { recentNotes } from "@/server/domain/customers/crm";
import { can } from "@/server/authz/permissions";
import {
  addDays,
  addMonths,
  formatClock,
  formatDateLabel,
  isDateString,
  startOfMonth,
  startOfWeek,
  weekdayOf,
  zonedDate,
  zonedParts,
  zonedTimeToUtc,
} from "@/lib/time";
import { colorHex } from "@/lib/calendar-colors";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui/button";
import { TimeGrid } from "@/components/calendar/time-grid";
import { MonthView, monthGridDates, type MonthDay } from "@/components/calendar/month-view";
import { Drawer } from "@/components/calendar/drawer";
import { StaffFilter } from "@/components/calendar/staff-filter";
import {
  hoursToRanges,
  intersectMinutes,
  rangeOnDate,
  type GridColumn,
  type GridEvent,
  type MinuteRange,
} from "@/components/calendar/layout";
import { NewAppointmentForm } from "@/components/appointments/new-appointment-form";
import { AppointmentDetails } from "@/components/appointments/appointment-details";

export const metadata: Metadata = { title: "Appointments" };

type View = "day" | "week" | "month";
type Search = { view?: string; date?: string; staff?: string; new?: string; nstaff?: string; time?: string; appt?: string };

function buildHref(base: Search, patch: Partial<Search>) {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
  // Keep `{placeholders}` (filled in later by the client) unencoded.
  return `/app/appointments?${params.toString()}`.replace(/%7B(\w+)%7D/g, "{$1}");
}

function availabilityFor(cal: CalendarContext, date: string, staffId: string | null): { available: MinuteRange[]; blocked: MinuteRange[] } {
  const wd = weekdayOf(date);
  const closure = cal.closures.find((c) => c.startsOn <= date && date <= c.endsOn);
  if (closure) return { available: [], blocked: [{ start: 9 * 60, end: 10 * 60, label: closure.reason ? `Closed · ${closure.reason}` : "Shop closed" }] };
  const shop = hoursToRanges(cal.shopHours.filter((h) => h.weekday === wd).map((h) => ({ from: h.opensAt, to: h.closesAt })));
  if (!staffId) return { available: shop, blocked: [] };
  const own = hoursToRanges(
    cal.workingHours.filter((h) => h.staffMemberId === staffId && h.weekday === wd).map((h) => ({ from: h.startsAt, to: h.endsAt })),
  );
  return { available: intersectMinutes(shop, own), blocked: [] };
}

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requirePageContext("appointments.view_all");
  const sp = await searchParams;
  const tz = ctx.shop.timezone;
  const now = new Date();
  const today = zonedDate(now, tz);
  const view: View = sp.view === "week" || sp.view === "month" ? sp.view : "day";
  const date = isDateString(sp.date) ? sp.date : today;
  const base: Search = { view, date, staff: sp.staff };

  const fromDate = view === "day" ? date : view === "week" ? startOfWeek(date) : startOfWeek(startOfMonth(date));
  const days = view === "day" ? 1 : view === "week" ? 7 : 42;
  const toDate = addDays(fromDate, days);
  const range = { from: zonedTimeToUtc(fromDate, 0, tz)!, to: zonedTimeToUtc(toDate, 0, tz)!, fromDate, toDate };

  const cal = await getCalendarContext(ctx, range);
  const staffFilter = sp.staff && cal.staff.some((s) => s.id === sp.staff) ? sp.staff : null;
  const appts = await listAppointments(ctx, { from: range.from, to: range.to, staffMemberId: staffFilter, includeCancelled: false });

  const event = (a: (typeof appts)[number], d: string, withStaff: boolean): GridEvent | null => {
    const r = rangeOnDate(a.startsAt, a.endsAt, d, tz);
    if (!r) return null;
    return {
      id: a.id,
      start: r.start,
      end: r.end,
      title: a.customerName,
      subtitle: `${formatClock(a.startsAt, tz)} · ${a.serviceName}${withStaff ? ` · ${a.staffName}` : ""}`,
      status: a.status,
      color: colorHex(a.calendarColor),
      href: buildHref(base, { appt: a.id }),
    };
  };
  const timeOffBlocks = (staffId: string, d: string): MinuteRange[] =>
    cal.timeOff
      .filter((t) => t.staffMemberId === staffId)
      .flatMap((t): MinuteRange[] => {
        const r = rangeOnDate(t.startsAt, t.endsAt, d, tz);
        return r ? [{ ...r, label: t.type === "sick" ? "Sick" : "Time off" }] : [];
      });

  let columns: GridColumn[] = [];
  let monthDays: MonthDay[] = [];
  const visibleStaff = staffFilter ? cal.staff.filter((s) => s.id === staffFilter) : cal.staff;

  if (view === "day") {
    columns = visibleStaff.map((s) => {
      const { available, blocked } = availabilityFor(cal, date, s.id);
      return {
        key: s.id,
        label: s.displayName,
        sublabel: available.length ? undefined : "Not working",
        date,
        isToday: date === today,
        bookHref: buildHref(base, { new: "1", nstaff: s.id, time: "{time}" }),
        available,
        blocked: [...blocked, ...timeOffBlocks(s.id, date)],
        events: appts.filter((a) => a.staffMemberId === s.id).map((a) => event(a, date, false)).filter((e): e is GridEvent => !!e),
      };
    });
  } else if (view === "week") {
    columns = Array.from({ length: 7 }, (_, i) => addDays(fromDate, i)).map((d) => {
      const { available, blocked } = availabilityFor(cal, d, staffFilter);
      return {
        key: d,
        label: formatDateLabel(d, { weekday: "short", day: "numeric" }),
        date: d,
        isToday: d === today,
        bookHref: buildHref({ ...base, date: d }, { new: "1", nstaff: staffFilter ?? undefined, time: "{time}" }),
        available,
        blocked: [...blocked, ...(staffFilter ? timeOffBlocks(staffFilter, d) : [])],
        events: appts.map((a) => event(a, d, !staffFilter)).filter((e): e is GridEvent => !!e),
      };
    });
  } else {
    const monthStart = startOfMonth(date);
    monthDays = monthGridDates(monthStart, fromDate).map((d) => ({
      date: d,
      inMonth: d.slice(0, 7) === monthStart.slice(0, 7),
      isToday: d === today,
      closed: cal.closures.some((c) => c.startsOn <= d && d <= c.endsOn),
      href: buildHref(base, { view: "day", date: d }),
      items: appts
        .filter((a) => zonedDate(a.startsAt, tz) === d)
        .map((a) => ({ id: a.id, startsAt: a.startsAt, title: a.customerName, color: colorHex(a.calendarColor), status: a.status })),
    }));
  }

  const step = (dir: 1 | -1) =>
    view === "day" ? addDays(date, dir) : view === "week" ? addDays(date, 7 * dir) : addMonths(date, dir);
  const title =
    view === "day"
      ? formatDateLabel(date)
      : view === "week"
        ? `${formatDateLabel(fromDate, { day: "numeric", month: "short" })} – ${formatDateLabel(addDays(fromDate, 6), { day: "numeric", month: "short", year: "numeric" })}`
        : formatDateLabel(date, { month: "long", year: "numeric" });

  // Drawer content
  const closeHref = buildHref(base, {});
  let drawer: React.ReactNode = null;
  if (sp.new === "1" || sp.appt) {
    const options = await getBookingOptions(ctx);
    if (sp.new === "1") {
      drawer = (
        <Drawer title="New appointment" closeHref={closeHref}>
          <NewAppointmentForm
            options={options}
            currency={ctx.shop.currency}
            defaults={{
              staffMemberId: sp.nstaff ?? staffFilter ?? undefined,
              date,
              time: sp.time && /^\d{2}:\d{2}$/.test(sp.time) ? sp.time : undefined,
            }}
            successHref={buildHref(base, { appt: "{id}" })}
          />
        </Drawer>
      );
    } else if (sp.appt) {
      const loaded = await getAppointment(ctx, sp.appt).then(
        async (data) => ({ data, notes: await recentNotes(ctx, data.customer.id, 5), error: null }),
        (err) => {
          if (!(err instanceof DomainError)) throw err;
          return { data: null, notes: [], error: err.message };
        },
      );
      drawer = (
        <Drawer title="Appointment" closeHref={closeHref}>
          {loaded.data ? (
            <AppointmentDetails
              data={loaded.data}
              timeZone={tz}
              currency={ctx.shop.currency}
              staff={options.staff}
              now={now}
              notes={loaded.notes}
              customerHref={`/app/customers/${loaded.data.customer.id}`}
              userId={ctx.userId}
              canModerateNotes={can(ctx.role, "customers.edit")}
            />
          ) : (
            <p className="text-sm text-fg-muted">{loaded.error}</p>
          )}
        </Drawer>
      );
    }
  }

  const activeCount = appts.filter((a) => a.status !== "cancelled").length;
  const nowParts = zonedParts(now, tz);

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {activeCount} appointment{activeCount === 1 ? "" : "s"}
            {staffFilter ? ` · ${visibleStaff[0]?.displayName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border-strong bg-surface p-0.5 shadow-card" role="tablist" aria-label="View">
            {(["day", "week", "month"] as const).map((v) => (
              <Link
                key={v}
                href={buildHref(base, { view: v })}
                role="tab"
                aria-selected={view === v}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13px] capitalize transition-colors",
                  view === v ? "bg-primary text-primary-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {v}
              </Link>
            ))}
          </div>
          <div className="inline-flex items-center gap-1">
            <Link href={buildHref(base, { date: step(-1) })} className={buttonClass("secondary", "sm", "px-2")} aria-label="Previous">
              <ChevronLeft className="size-4" />
            </Link>
            <Link href={buildHref(base, { date: today })} className={buttonClass("secondary", "sm")}>
              Today
            </Link>
            <Link href={buildHref(base, { date: step(1) })} className={buttonClass("secondary", "sm", "px-2")} aria-label="Next">
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <StaffFilter value={staffFilter ?? "all"} staff={cal.staff} hrefTemplate={buildHref({ ...base, staff: "{staff}" }, {})} />
          <Link href={buildHref(base, { new: "1", nstaff: staffFilter ?? undefined })} scroll={false} className={buttonClass("primary", "sm")}>
            <Plus className="size-4" /> New appointment
          </Link>
        </div>
      </div>

      {cal.staff.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
          <p className="font-medium">No barbers to schedule yet</p>
          <p className="mt-1 text-sm text-fg-muted">Add a barber profile in Staff, then bookings appear here.</p>
          <Link href="/app/staff" className={buttonClass("secondary", "sm", "mt-4")}>
            Go to Staff
          </Link>
        </div>
      ) : view === "month" ? (
        <MonthView days={monthDays} timeZone={tz} />
      ) : (
        <TimeGrid columns={columns} nowMinutes={nowParts.date >= fromDate && nowParts.date < toDate ? nowParts.minutes : null} />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-fg-muted">
        {cal.staff.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: colorHex(s.calendarColor) }} /> {s.displayName}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="cal-offhours inline-block size-3 rounded-sm border border-border" /> Not working
        </span>
      </div>

      {drawer}
    </>
  );
}
