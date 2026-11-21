import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getStaffProfile } from "@/server/domain/staff/service";
import { DomainError } from "@/server/errors";
import { ROLE_LABELS, can } from "@/server/authz/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { colorHex } from "@/lib/calendar-colors";
import { zonedDate } from "@/lib/time";
import { deleteTimeOffAction, setStaffActiveAction } from "../actions";
import { ProfileForm, ServicesForm, TimeOffForm, WorkingHoursForm } from "./forms";

export const metadata: Metadata = { title: "Barber" };

const TYPE_LABEL = { holiday: "Holiday", sick: "Sick", personal: "Personal", other: "Other" } as const;

export default async function StaffMemberPage({ params }: { params: Promise<{ staffId: string }> }) {
  const ctx = await requirePageContext("staff.view");
  const { staffId } = await params;
  const data = await getStaffProfile(ctx, staffId).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (!data) notFound();
  const { profile } = data;
  const tz = ctx.shop.timezone;
  const today = zonedDate(new Date(), tz);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const editable = can(ctx.role, "staff.manage");

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/staff" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Staff
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <span className="size-3 rounded-full" style={{ background: colorHex(profile.calendarColor) }} aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{profile.displayName}</h1>
        {profile.role ? <Badge>{ROLE_LABELS[profile.role]}</Badge> : <Badge>No login</Badge>}
        {!profile.isActive ? <Badge tone="danger">Inactive</Badge> : null}
        <Link href={`/app/appointments?view=week&staff=${profile.id}`} className="ml-auto text-[13px] text-fg-muted hover:text-fg">
          View calendar →
        </Link>
      </div>

      {editable ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <ProfileForm
              staffMemberId={profile.id}
              defaults={{
                displayName: profile.displayName,
                bio: profile.bio ?? "",
                calendarColor: profile.calendarColor ?? "graphite",
                isBookable: profile.isBookable,
              }}
            />
            <Card>
              <CardHeader title="Time off" description="Holidays, sick days and appointments elsewhere. Blocks bookings." />
              {data.timeOff.length ? (
                <ul className="divide-y divide-border border-b border-border">
                  {data.timeOff.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium tabular">
                          {fmt.format(t.startsAt)} – {fmt.format(t.endsAt)}
                        </span>
                        <span className="block text-[12px] text-fg-muted">
                          {TYPE_LABEL[t.type]}
                          {t.note ? ` · ${t.note}` : ""}
                        </span>
                      </span>
                      <ActionButton action={deleteTimeOffAction} fields={{ timeOffId: t.id }} confirm="Remove this time off?">
                        Remove
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              ) : null}
              <CardBody>
                <TimeOffForm staffMemberId={profile.id} today={today} />
              </CardBody>
            </Card>
            {!profile.membershipId ? (
              <Card>
                <CardBody className="flex items-center justify-between gap-4">
                  <p className="text-[13px] text-fg-muted">
                    {profile.isActive
                      ? "Deactivate to hide this barber from the calendar and booking. History is kept."
                      : "This barber is inactive and can't be booked."}
                  </p>
                  <ActionButton
                    action={setStaffActiveAction}
                    fields={{ staffMemberId: profile.id, active: String(!profile.active) }}
                    variant={profile.active ? "danger" : "secondary"}
                    confirm={profile.active ? `Deactivate ${profile.displayName}?` : undefined}
                  >
                    {profile.active ? "Deactivate" : "Reactivate"}
                  </ActionButton>
                </CardBody>
              </Card>
            ) : null}
          </div>
          <div className="flex flex-col gap-6">
            <WorkingHoursForm staffMemberId={profile.id} hours={data.hours} />
            <ServicesForm staffMemberId={profile.id} services={data.services} currency={ctx.shop.currency} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">You can view this barber, but only owners and managers can change their schedule.</p>
      )}
    </div>
  );
}
