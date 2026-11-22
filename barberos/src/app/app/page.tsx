import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Clock } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getBookingSettings, getOpeningHours, getShop } from "@/server/domain/shops/service";
import { listTeam } from "@/server/domain/team/service";
import { listServices } from "@/server/domain/services/service";
import { listStaff } from "@/server/domain/staff/service";
import { listAppointments } from "@/server/domain/appointments/service";
import { AgendaList } from "@/components/appointments/agenda-list";
import { canViewFinance, getFinanceSummary } from "@/server/domain/finance/service";
import { lowStockProducts } from "@/server/domain/finance/inventory";
import { formatMoney } from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import { AlertTriangle } from "lucide-react";
import { addDays, startOfWeek, zonedDate, zonedTimeToUtc } from "@/lib/time";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { openStatus, shortTime, zonedNow } from "@/lib/time";
import { can, ROLE_LABELS } from "@/server/authz/permissions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Overview" };

function greeting(minutes: number) {
  if (minutes < 12 * 60) return "Good morning";
  if (minutes < 18 * 60) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage() {
  const ctx = await requirePageContext("dashboard.view");
  const now = new Date();
  const tz = ctx.shop.timezone;
  const today = zonedDate(now, tz);
  const weekStart = startOfWeek(today);
  const [shop, hours, team, services, staff, weekAppts, bookingSettings] = await Promise.all([
    getShop(ctx),
    getOpeningHours(ctx),
    listTeam(ctx),
    listServices(ctx),
    listStaff(ctx),
    listAppointments(ctx, {
      from: zonedTimeToUtc(weekStart, 0, tz)!,
      to: zonedTimeToUtc(addDays(weekStart, 7), 0, tz)!,
      includeCancelled: true,
    }),
    getBookingSettings(ctx),
  ]);
  const financeVisible = await canViewFinance(ctx);
  const [todayMoney, monthMoney, lowStock] = await Promise.all([
    financeVisible ? getFinanceSummary(ctx, { fromDate: today, toDate: today }) : null,
    financeVisible ? getFinanceSummary(ctx, resolvePeriod({ p: "month" }, today)) : null,
    can(ctx.role, "inventory.manage") ? lowStockProducts(ctx) : [],
  ]);
  const todays = weekAppts.filter((a) => zonedDate(a.startsAt, tz) === today);
  const booked = (list: typeof weekAppts) => list.filter((a) => a.status !== "cancelled");
  const upcoming = todays.filter((a) => (a.status === "confirmed" || a.status === "pending") && a.endsAt > now);
  const cancelledThisWeek = weekAppts.filter((a) => a.status === "cancelled" || a.status === "no_show");

  const { weekday, minutes } = zonedNow(shop.timezone, now);
  const status = openStatus(hours, shop.timezone, now);
  const todayHours = hours.filter((h) => h.weekday === weekday);
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: shop.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const activeMembers = team.members.filter((m) => m.status === "active");
  // Barber profiles, including barbers who don't sign in.
  const bookableBarbers = staff;

  const checklist = [
    { label: "Create your shop", done: true, href: "/app/settings" },
    { label: "Set your opening hours", done: hours.length > 0, href: "/app/settings/hours" },
    {
      label: "Add your barbers",
      done: activeMembers.length > 1 || team.pending.length > 0 || staff.length > 1,
      href: "/app/staff",
    },
    { label: "Add your services and prices", done: services.length > 0, href: "/app/settings/services" },
    { label: "Open online booking", done: bookingSettings.onlineBookingEnabled, href: "/app/settings/booking" },
  ];
  const completed = checklist.filter((c) => c.done).length;

  return (
    <>
      <PageHeader
        title={`${greeting(minutes)}, ${ctx.user.name.split(" ")[0]}`}
        description={`${dateLabel} · ${shop.name}`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Today" value={String(booked(todays).length)} sub={`${todays.filter((a) => a.status === "completed").length} completed · ${upcoming.length} to go`} />
        <Kpi label="This week" value={String(booked(weekAppts).length)} sub={`${cancelledThisWeek.length} cancelled or no-show`} />
        <Card>
          <CardBody>
            <p className="text-[13px] text-fg-muted">Shop status</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={cn("size-2 rounded-full", status.open ? "bg-success" : "bg-fg-subtle")} aria-hidden />
              <p className="text-2xl font-semibold tracking-tight">{status.open ? "Open" : "Closed"}</p>
            </div>
            <p className="mt-1 truncate text-[13px] text-fg-muted tabular">
              {todayHours.length ? todayHours.map((h) => `${shortTime(h.opensAt)}–${shortTime(h.closesAt)}`).join(", ") : status.label}
            </p>
          </CardBody>
        </Card>
        <Kpi
          label="Team"
          value={String(bookableBarbers.length)}
          sub={`barber${bookableBarbers.length === 1 ? "" : "s"}${team.pending.length ? ` · ${team.pending.length} invite${team.pending.length > 1 ? "s" : ""} pending` : ""}`}
        />
      </div>

      {todayMoney && monthMoney ? (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Revenue today" value={formatMoney(todayMoney.revenue, ctx.shop.currency)} sub={`${todayMoney.paymentCount} payment${todayMoney.paymentCount === 1 ? "" : "s"}`} />
          <Kpi label="Revenue this month" value={formatMoney(monthMoney.revenue, ctx.shop.currency)} sub={`${formatMoney(monthMoney.commissions, ctx.shop.currency)} commissions`} />
          <Kpi label="Profit this month" value={formatMoney(monthMoney.profit, ctx.shop.currency)} sub="Estimated, after costs" />
          <Card>
            <CardBody className="flex h-full flex-col justify-between">
              <p className="text-[13px] text-fg-muted">Finance</p>
              <Link href="/app/finance" className="mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline">
                Open the details <ArrowRight className="size-3.5" />
              </Link>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {lowStock.length ? (
        <Link
          href="/app/inventory"
          className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-warning-bg px-4 py-3 text-sm text-warning"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">
            Low stock: {lowStock.slice(0, 4).map((p) => `${p.name} (${p.stockQty})`).join(", ")}
            {lowStock.length > 4 ? ` and ${lowStock.length - 4} more` : ""}
          </span>
          <ArrowRight className="size-4" />
        </Link>
      ) : null}

      <Card className="mt-6">
        <CardHeader
          title="Up next today"
          description={upcoming.length ? undefined : "Nothing else booked for today."}
          action={
            <Link href="/app/appointments" className="inline-flex items-center gap-1 text-[13px] text-fg-muted hover:text-fg">
              Open calendar <ArrowRight className="size-3" />
            </Link>
          }
        />
        {upcoming.length ? (
          <CardBody>
            <AgendaList items={upcoming.slice(0, 6)} timeZone={tz} hrefFor={(id) => `/app/appointments?appt=${id}`} highlightId={upcoming[0]?.id} />
          </CardBody>
        ) : null}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Get your shop ready"
            description={`${completed} of ${checklist.length} done`}
            action={
              <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${(completed / checklist.length) * 100}%` }} />
              </div>
            }
          />
          <ul className="divide-y divide-border">
            {checklist.map((item) => {
              const content = (
                <>
                  {item.done ? (
                    <CheckCircle2 className="size-5 text-success" aria-label="Done" />
                  ) : (
                    <Circle className="size-5 text-fg-subtle" aria-label="To do" />
                  )}
                  <span className={cn("flex-1 text-sm", item.done && "text-fg-muted line-through decoration-fg-subtle")}>
                    {item.label}
                  </span>
                  {"soon" in item && item.soon ? (
                    <Badge>Next release</Badge>
                  ) : !item.done ? (
                    <ArrowRight className="size-4 text-fg-muted" aria-hidden />
                  ) : null}
                </>
              );
              return (
                <li key={item.label}>
                  {"href" in item && item.href && !item.done ? (
                    <Link href={item.href} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-muted/60">
                      {content}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-3.5">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Team"
            action={
              <Link href="/app/staff" className="text-[13px] text-fg-muted hover:text-fg">
                Manage
              </Link>
            }
          />
          <ul className="divide-y divide-border">
            {activeMembers.slice(0, 6).map((m) => (
              <li key={m.membershipId} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-8 place-items-center rounded-full bg-surface-muted text-[12px] font-semibold">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="block truncate text-[12px] text-fg-muted">{m.email}</span>
                </span>
                <Badge tone={m.role === "owner" ? "inverse" : "neutral"}>{ROLE_LABELS[m.role]}</Badge>
              </li>
            ))}
            {team.pending.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-8 place-items-center rounded-full border border-dashed border-border-strong text-fg-subtle">
                  <Clock className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{p.email}</span>
                <Badge tone="warning">Invited</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-[13px] text-fg-muted">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular">{value}</p>
        <p className="mt-1 truncate text-[13px] text-fg-muted">{sub}</p>
      </CardBody>
    </Card>
  );
}
