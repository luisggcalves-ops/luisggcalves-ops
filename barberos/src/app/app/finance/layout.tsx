import { Suspense } from "react";
import { requirePageContext } from "@/server/tenancy";
import { canViewFinance } from "@/server/domain/finance/service";
import { PageHeader } from "@/components/ui/page-header";
import { FinanceNav } from "@/components/finance/finance-nav";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageContext("dashboard.view");
  if (!(await canViewFinance(ctx))) {
    return (
      <>
        <PageHeader title="Finance" />
        <p className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center text-sm text-fg-muted">
          The shop owner hasn&apos;t given managers access to finances.
        </p>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Finance" description="Revenue, commissions, expenses and estimated profit, from recorded payments." />
      <Suspense>
        <FinanceNav />
      </Suspense>
      {children}
    </>
  );
}
