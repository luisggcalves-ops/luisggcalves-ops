import type { Metadata } from "next";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { canViewFinance } from "@/server/domain/finance/service";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { FinanceNav } from "@/components/finance/finance-nav";
import { resolvePeriod } from "@/lib/period";
import { zonedDate } from "@/lib/time";

export const metadata: Metadata = { title: "Reports" };

const REPORTS = [
  { kind: "payments", title: "Payments", text: "Every payment with items, method, tip and status. Hand this to your accountant." },
  { kind: "commissions", title: "Commissions", text: "What each barber earned, line by line, for payroll." },
  { kind: "appointments", title: "Appointments", text: "All bookings with barber, customer, service and outcome." },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const ctx = await requirePageContext("dashboard.view");
  const sp = await searchParams;
  if (!(await canViewFinance(ctx))) {
    return (
      <>
        <PageHeader title="Reports" />
        <p className="text-sm text-fg-muted">The shop owner hasn&apos;t given managers access to financial reports.</p>
      </>
    );
  }
  const period = resolvePeriod(sp, zonedDate(new Date(), ctx.shop.timezone));
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  return (
    <>
      <PageHeader title="Reports" description={`CSV exports for ${period.label.toLowerCase()}. They open in Excel, Numbers or Google Sheets.`} />
      <Suspense>
        <div className="[&>div>nav]:hidden">
          <FinanceNav />
        </div>
      </Suspense>
      <div className="grid gap-4 md:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.kind}>
            <CardBody className="flex h-full flex-col gap-3">
              <div className="flex-1">
                <p className="font-semibold">{r.title}</p>
                <p className="mt-1 text-[13px] text-fg-muted">{r.text}</p>
              </div>
              <a href={`/app/reports/${r.kind}${qs ? `?${qs}` : ""}`} className={buttonClass("secondary", "sm", "self-start")}>
                <Download className="size-3.5" /> Download CSV
              </a>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
