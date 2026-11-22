import type { Metadata } from "next";
import { Info } from "lucide-react";
import { requirePageContext } from "@/server/tenancy";
import { canViewFinance, getFinanceSummary } from "@/server/domain/finance/service";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { RevenueChart } from "@/components/finance/revenue-chart";
import { formatMoney } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/lib/validation/finance";
import { periodFor, type FinanceSearch } from "./period";

export const metadata: Metadata = { title: "Finance" };

const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", transfer: "Transfer", other: "Other" };

export default async function FinanceOverviewPage({ searchParams }: { searchParams: Promise<FinanceSearch> }) {
  const ctx = await requirePageContext("dashboard.view");
  if (!(await canViewFinance(ctx))) return null;
  const period = periodFor(await searchParams, ctx.shop.timezone);
  const s = await getFinanceSummary(ctx, period);
  const m = (c: number) => formatMoney(c, ctx.shop.currency);
  const maxStaff = Math.max(1, ...s.byStaff.map((b) => b.revenue));
  const maxSvc = Math.max(1, ...s.byService.map((b) => b.revenue));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Revenue" value={m(s.revenue)} hint={`${s.paymentCount} payment${s.paymentCount === 1 ? "" : "s"} · services ${m(s.serviceRevenue)} · products ${m(s.productRevenue)}`} />
        <Tile label="Commissions" value={m(s.commissions)} hint="Earned by barbers on these sales" />
        <Tile label="Expenses" value={m(s.expenses + s.productCost)} hint={`${m(s.expenses)} recorded + ${m(s.productCost)} product cost`} />
        <Tile label="Estimated profit" value={m(s.profit)} hint="Revenue − product cost − commissions − expenses" emphasis />
      </div>
      <p className="-mt-2 flex items-center gap-1.5 text-[12px] text-fg-subtle">
        <Info className="size-3.5" /> Based on payments recorded in {period.label.toLowerCase()} that haven&apos;t been voided. Tips ({m(s.tips)}) go to barbers and aren&apos;t counted as revenue.
      </p>

      <Card>
        <CardHeader title="Revenue per day" description={period.label} />
        <CardBody>
          <RevenueChart daily={s.daily} format={ctx.shop.currency} />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By barber" description="Revenue they generated, commission and tips" />
          {s.byStaff.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wider text-fg-subtle">
                  <th className="px-5 py-2 font-medium">Barber</th>
                  <th className="px-5 py-2 text-right font-medium">Revenue</th>
                  <th className="px-5 py-2 text-right font-medium">Commission</th>
                  <th className="px-5 py-2 text-right font-medium">Tips</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {s.byStaff.map((b) => (
                  <tr key={b.staffMemberId}>
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{b.name}</div>
                      <div className="mt-1 h-1 rounded-full bg-surface-muted" aria-hidden>
                        <div className="h-1 rounded-full bg-fg" style={{ width: `${(b.revenue / maxStaff) * 100}%` }} />
                      </div>
                      <div className="mt-0.5 text-[12px] text-fg-muted">{b.services} service{b.services === 1 ? "" : "s"}</div>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular">{m(b.revenue)}</td>
                    <td className="px-5 py-2.5 text-right tabular">{m(b.commission)}</td>
                    <td className="px-5 py-2.5 text-right tabular text-fg-muted">{m(b.tips)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <CardBody className="text-sm text-fg-muted">No payments in this period.</CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="By service" />
          {s.byService.length ? (
            <ul className="divide-y divide-border">
              {s.byService.map((b) => (
                <li key={b.name} className="px-5 py-2.5">
                  <div className="flex justify-between text-sm">
                    <span>
                      {b.name} <span className="text-fg-muted">×{b.count}</span>
                    </span>
                    <span className="tabular">{m(b.revenue)}</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-surface-muted" aria-hidden>
                    <div className="h-1 rounded-full bg-fg" style={{ width: `${(b.revenue / maxSvc) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody className="text-sm text-fg-muted">No services paid in this period.</CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Payment methods" />
          {s.byMethod.length ? (
            <ul className="divide-y divide-border">
              {s.byMethod.map((b) => (
                <li key={b.method} className="flex justify-between px-5 py-2.5 text-sm">
                  <span>
                    {METHOD_LABEL[b.method]} <span className="text-fg-muted">×{b.count}</span>
                  </span>
                  <span className="tabular">{m(b.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody className="text-sm text-fg-muted">No payments in this period.</CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Expenses by category" />
          {s.expensesByCategory.length ? (
            <ul className="divide-y divide-border">
              {s.expensesByCategory.map((e) => (
                <li key={e.category} className="flex justify-between px-5 py-2.5 text-sm">
                  <span>{EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}</span>
                  <span className="tabular">{m(e.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody className="text-sm text-fg-muted">No expenses recorded in this period.</CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, emphasis }: { label: string; value: string; hint: string; emphasis?: boolean }) {
  return (
    <Card inverse={emphasis}>
      <CardBody>
        <p className={emphasis ? "text-[13px] opacity-75" : "text-[13px] text-fg-muted"}>{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular" data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
          {value}
        </p>
        <p className={emphasis ? "mt-1 text-[12px] opacity-75" : "mt-1 text-[12px] text-fg-muted"}>{hint}</p>
      </CardBody>
    </Card>
  );
}
