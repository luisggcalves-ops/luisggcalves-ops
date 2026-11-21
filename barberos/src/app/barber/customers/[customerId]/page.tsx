import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getCustomerProfile } from "@/server/domain/customers/crm";
import { DomainError } from "@/server/errors";
import { can } from "@/server/authz/permissions";
import { getOwnStaffProfile } from "@/server/domain/shops/service";
import { CustomerHeader, CustomerHistoryCard, CustomerNotesCard } from "@/components/customers/customer-profile";

export const metadata: Metadata = { title: "Customer" };

export default async function BarberCustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const ctx = await requirePageContext("barber_app.view");
  const { customerId } = await params;
  const data = await getCustomerProfile(ctx, customerId).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (!data) notFound();
  const own = await getOwnStaffProfile(ctx);
  const seesAll = can(ctx.role, "appointments.view_all");
  return (
    <div className="flex flex-col gap-5">
      <Link href="/barber/customers" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
        <ArrowLeft className="size-3.5" /> Customers
      </Link>
      <CustomerHeader data={data} />
      {!data.customer.anonymizedAt ? (
        <CustomerNotesCard data={data} timeZone={ctx.shop.timezone} userId={ctx.userId} canModerate={can(ctx.role, "customers.edit")} />
      ) : null}
      <CustomerHistoryCard data={data} timeZone={ctx.shop.timezone} currency={ctx.shop.currency} hrefFor={(a) => (seesAll || a.staffMemberId === own?.id ? `/barber/appointments/${a.id}` : null)} />
    </div>
  );
}
