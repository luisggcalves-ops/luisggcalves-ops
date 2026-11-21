import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Clock } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getOpeningHours, getShop } from "@/server/domain/shops/service";
import { listTeam } from "@/server/domain/team/service";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { openStatus, shortTime, zonedNow } from "@/lib/time";
import { ROLE_LABELS } from "@/server/authz/permissions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Overview" };

function greeting(minutes: number) {
  if (minutes < 12 * 60) return "Good morning";
  if (minutes < 18 * 60) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage() {
  const ctx = await requirePageContext("dashboard.view");
  const [shop, hours, team] = await Promise.all([getShop(ctx), getOpeningHours(ctx), listTeam(ctx)]);

  const now = new Date();
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
  const bookableBarbers = team.members.filter((m) => m.status === "active" && m.staffMemberId);

  const checklist = [
    { label: "Create your shop", done: true, href: "/app/settings" },
    { label: "Set your opening hours", done: hours.length > 0, href: "/app/settings/hours" },
    {
      label: "Invite your barbers",
      done: activeMembers.length > 1 || team.pending.length > 0,
      href: "/app/staff",
    },
    { label: "Add your services and prices", done: false, soon: true },
    { label: "Open online booking", done: false, soon: true },
  ];
  const completed = checklist.filter((c) => c.done).length;

  return (
    <>
      <PageHeader
        title={`${greeting(minutes)}, ${ctx.user.name.split(" ")[0]}`}
        description={`${dateLabel} · ${shop.name}`}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-[13px] text-fg-muted">Shop status</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={cn("size-2 rounded-full", status.open ? "bg-success" : "bg-fg-subtle")} aria-hidden />
              <p className="text-lg font-semibold tracking-tight">{status.open ? "Open" : "Closed"}</p>
            </div>
            <p className="mt-1 text-[13px] text-fg-muted">{status.label}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[13px] text-fg-muted">Today&apos;s hours</p>
            <p className="mt-2 text-lg font-semibold tracking-tight tabular">
              {todayHours.length
                ? todayHours.map((h) => `${shortTime(h.opensAt)}–${shortTime(h.closesAt)}`).join(", ")
                : "Closed today"}
            </p>
            <Link href="/app/settings/hours" className="mt-1 inline-flex items-center gap-1 text-[13px] text-fg-muted hover:text-fg">
              Edit hours <ArrowRight className="size-3" />
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[13px] text-fg-muted">Team</p>
            <p className="mt-2 text-lg font-semibold tracking-tight tabular">
              {activeMembers.length} {activeMembers.length === 1 ? "member" : "members"}
            </p>
            <p className="mt-1 text-[13px] text-fg-muted">
              {bookableBarbers.length} with a barber profile
              {team.pending.length ? ` · ${team.pending.length} invite${team.pending.length > 1 ? "s" : ""} pending` : ""}
            </p>
          </CardBody>
        </Card>
      </div>

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

      <p className="mt-8 text-[13px] text-fg-subtle">
        Appointments, revenue and customer insights will appear here once the calendar and booking modules are live.
      </p>
    </>
  );
}
