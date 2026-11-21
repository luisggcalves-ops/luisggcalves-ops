import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getAppointment, getBookingOptions } from "@/server/domain/appointments/service";
import { DomainError } from "@/server/errors";
import { recentNotes } from "@/server/domain/customers/crm";
import { can } from "@/server/authz/permissions";
import { AppointmentDetails } from "@/components/appointments/appointment-details";

export const metadata: Metadata = { title: "Appointment" };

export default async function BarberAppointmentPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const ctx = await requirePageContext("barber_app.view");
  const { appointmentId } = await params;
  const data = await getAppointment(ctx, appointmentId).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (!data) notFound();
  const options = await getBookingOptions(ctx);
  const notes = await recentNotes(ctx, data.customer.id, 5);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/barber" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
        <ArrowLeft className="size-3.5" /> Today
      </Link>
      <AppointmentDetails
        data={data}
        timeZone={ctx.shop.timezone}
        currency={ctx.shop.currency}
        staff={options.staff}
        now={new Date()}
        notes={notes}
        customerHref={`/barber/customers/${data.customer.id}`}
        userId={ctx.userId}
        canModerateNotes={can(ctx.role, "customers.edit")}
      />
    </div>
  );
}
