import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, CheckCircle2, Clock, Scissors, User } from "lucide-react";
import { getManagedBooking, getRescheduleAvailability } from "@/server/domain/public-booking/service";
import { formatClock, formatDateLabel, zonedDate } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { buttonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/appointments/status-badge";
import { CancelBooking, RescheduleBooking } from "./manage-forms";

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ booked?: string; moved?: string }>;
}) {
  const { slug, token } = await params;
  const sp = await searchParams;
  const data = await getManagedBooking(token);
  if (!data || data.shop.slug !== slug) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Booking not found</h1>
        <p className="text-sm text-fg-muted">This link isn&apos;t valid. Please contact the shop.</p>
        <Link href={`/book/${slug}`} className={buttonClass("secondary", "md", "self-start")}>
          Make a new booking
        </Link>
      </div>
    );
  }
  const { shop, appointment: a, policy } = data;
  const tz = shop.timezone;
  const reschedule = policy.canChange ? await getRescheduleAvailability(token, { days: 14 }) : [];
  const deadline = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(policy.deadline);

  return (
    <div className="flex flex-col gap-5">
      {sp.booked ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <CheckCircle2 className="size-10 text-success" strokeWidth={1.5} />
          <h1 className="text-2xl font-semibold tracking-tight">{a.status === "pending" ? "Request received" : "You're booked!"}</h1>
          <p className="text-sm text-fg-muted">
            {a.status === "pending" ? `${shop.name} will confirm your booking shortly.` : "See you soon."} Keep this page. It&apos;s your link to change or cancel.
          </p>
        </div>
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">
          {a.status === "cancelled" ? "Booking cancelled" : sp.moved ? "Booking moved" : "Your booking"}
        </h1>
      )}

      <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold tracking-tight">{formatDateLabel(zonedDate(a.startsAt, tz))}</p>
            <p className="text-sm text-fg-muted tabular">
              {formatClock(a.startsAt, tz)} – {formatClock(a.endsAt, tz)}
            </p>
          </div>
          <StatusBadge status={a.status} />
        </div>
        <dl className="mt-4 grid grid-cols-[20px_1fr] items-center gap-x-3 gap-y-2 text-sm">
          <Scissors className="size-4 text-fg-subtle" aria-hidden />
          <dd>
            {a.serviceName} · {formatMoney(a.priceCents, shop.currency)}
          </dd>
          <User className="size-4 text-fg-subtle" aria-hidden />
          <dd>with {a.staffName}</dd>
          <Clock className="size-4 text-fg-subtle" aria-hidden />
          <dd>{a.durationMin} minutes · pay at the shop</dd>
        </dl>
        {policy.active ? (
          <a href={`/book/${slug}/manage/${token}/calendar.ics`} className={buttonClass("secondary", "sm", "mt-4 w-full")}>
            <CalendarPlus className="size-4" /> Add to calendar
          </a>
        ) : null}
      </section>

      {policy.active ? (
        policy.canChange ? (
          <div className="flex flex-col gap-2">
            <RescheduleBooking
              token={token}
              slug={slug}
              days={reschedule.map((d) => ({ ...d, label: formatDateLabel(d.date, { weekday: "short", day: "numeric" }) }))}
            />
            <CancelBooking token={token} />
            <p className="text-center text-[12px] text-fg-subtle">You can change or cancel online until {deadline}.</p>
          </div>
        ) : (
          <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-fg-muted">
            It&apos;s too late to change this booking online. Please call {shop.name}
            {shop.phone ? ` on ${formatPhone(shop.phone) || shop.phone}` : ""}.
          </p>
        )
      ) : (
        <Link href={`/book/${slug}`} className={buttonClass("primary", "md")}>
          Book again
        </Link>
      )}

      {shop.address || shop.phone ? (
        <p className="text-center text-[13px] text-fg-muted">
          {[shop.name, shop.address, shop.phone ? formatPhone(shop.phone) || shop.phone : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
