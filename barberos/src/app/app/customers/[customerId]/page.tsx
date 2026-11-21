import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { getCustomerProfile } from "@/server/domain/customers/crm";
import { listStaff } from "@/server/domain/staff/service";
import { DomainError } from "@/server/errors";
import { can } from "@/server/authz/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { formatPhone } from "@/lib/phone";
import { CustomerHeader, CustomerHistoryCard, CustomerNotesCard } from "@/components/customers/customer-profile";
import { EditCustomerForm } from "@/components/customers/edit-customer-form";
import { anonymizeCustomerAction } from "@/app/actions/customers";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const ctx = await requirePageContext("customers.view_all");
  const { customerId } = await params;
  const data = await getCustomerProfile(ctx, customerId).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (!data) notFound();
  const staff = await listStaff(ctx);
  const c = data.customer;
  const tz = ctx.shop.timezone;
  const deleted = !!c.anonymizedAt;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/customers" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Customers
      </Link>
      <CustomerHeader data={data} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6">
          {!deleted ? <CustomerNotesCard data={data} timeZone={tz} userId={ctx.userId} canModerate={can(ctx.role, "customers.edit")} /> : null}
          <CustomerHistoryCard data={data} timeZone={tz} currency={ctx.shop.currency} hrefFor={(a) => `/app/appointments?appt=${a.id}`} />
        </div>
        <div className="flex flex-col gap-6">
          {!deleted && can(ctx.role, "customers.edit") ? (
            <EditCustomerForm
              customerId={c.id}
              staff={staff.map((s) => ({ id: s.id, displayName: s.displayName }))}
              defaults={{
                fullName: c.fullName,
                phone: formatPhone(c.phoneE164),
                email: c.email ?? "",
                preferredStaffMemberId: c.preferredStaffMemberId ?? "",
                hairPreferences: c.hairPreferences ?? "",
                marketingConsent: !!c.marketingConsentAt,
              }}
            />
          ) : null}
          {!deleted && (can(ctx.role, "customers.export") || can(ctx.role, "customers.delete")) ? (
            <Card>
              <CardHeader title="Privacy (GDPR)" description="Customers can ask for a copy of their data, or for it to be deleted." />
              <CardBody className="flex flex-col gap-3">
                {can(ctx.role, "customers.export") ? (
                  <a href={`/app/customers/${c.id}/export`} className={buttonClass("secondary", "sm", "self-start")}>
                    <Download className="size-3.5" /> Export data (JSON)
                  </a>
                ) : null}
                {can(ctx.role, "customers.delete") ? (
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <p className="text-[13px] text-fg-muted">
                      Deletes their name, contact details and notes, and cancels future bookings. Past visit records stay, anonymised.
                    </p>
                    <ActionButton
                      action={anonymizeCustomerAction}
                      fields={{ customerId: c.id }}
                      variant="danger"
                      confirm={`Permanently delete ${c.fullName}'s personal data? This can't be undone.`}
                    >
                      Delete data
                    </ActionButton>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
