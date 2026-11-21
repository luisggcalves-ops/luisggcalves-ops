import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getBookingOptions } from "@/server/domain/appointments/service";
import { DomainError } from "@/server/errors";
import { NewAppointmentForm } from "@/components/appointments/new-appointment-form";
import { zonedDate } from "@/lib/time";

export const metadata: Metadata = { title: "New booking" };

export default async function BarberNewBookingPage() {
  const ctx = await requirePageContext("barber_app.view");
  const options = await getBookingOptions(ctx).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  return (
    <div className="flex flex-col gap-4">
      <Link href="/barber" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
        <ArrowLeft className="size-3.5" /> Today
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">New booking</h1>
      {options ? (
        <NewAppointmentForm
          options={{
            ...options,
            // In the barber app you book for yourself, even as an owner.
            staff: options.staff.filter((s) => !options.ownStaffId || s.id === options.ownStaffId),
            canManageAll: options.canManageAll,
          }}
          currency={ctx.shop.currency}
          defaults={{ staffMemberId: options.ownStaffId ?? undefined, date: zonedDate(new Date(), ctx.shop.timezone) }}
          successHref="/barber/appointments/{id}"
        />
      ) : (
        <p className="text-sm text-fg-muted">You need a barber profile to book appointments.</p>
      )}
    </div>
  );
}
