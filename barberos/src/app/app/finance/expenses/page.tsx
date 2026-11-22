import type { Metadata } from "next";
import { requirePageContext } from "@/server/tenancy";
import { canViewFinance, listExpenses } from "@/server/domain/finance/service";
import { can } from "@/server/authz/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/action-button";
import { voidExpenseAction } from "@/app/actions/finance";
import { formatMoney } from "@/lib/money";
import { formatDateLabel, zonedDate } from "@/lib/time";
import { EXPENSE_CATEGORIES } from "@/lib/validation/finance";
import { periodFor, type FinanceSearch } from "../period";
import { ExpenseForm } from "./form";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<FinanceSearch> }) {
  const ctx = await requirePageContext("dashboard.view");
  if (!(await canViewFinance(ctx))) return null;
  const period = periodFor(await searchParams, ctx.shop.timezone);
  const rows = await listExpenses(ctx, period);
  const m = (c: number) => formatMoney(c, ctx.shop.currency);
  const total = rows.filter((r) => !r.voidedAt).reduce((s, r) => s + r.amountCents, 0);
  const label = (c: string) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <Card>
        <CardHeader title="Expenses" description={`${m(total)} in ${period.label.toLowerCase()}`} />
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((e) => (
              <li key={e.id} className={e.voidedAt ? "flex items-center gap-3 px-5 py-3 opacity-60" : "flex items-center gap-3 px-5 py-3"}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {label(e.category)}
                    {e.vendor ? <span className="font-normal text-fg-muted"> · {e.vendor}</span> : null}
                  </span>
                  <span className="block truncate text-[12px] text-fg-muted">
                    {formatDateLabel(e.incurredOn, { day: "numeric", month: "short", year: "numeric" })}
                    {e.description ? ` · ${e.description}` : ""}
                    {e.voidedAt ? ` · removed (${e.voidReason})` : ""}
                  </span>
                </span>
                <span className={e.voidedAt ? "tabular line-through" : "tabular"}>{m(e.amountCents)}</span>
                {!e.voidedAt && can(ctx.role, "expenses.manage") ? (
                  <ActionButton action={voidExpenseAction} fields={{ expenseId: e.id, reason: "Removed by staff" }} confirm="Remove this expense? It stays in the record as removed.">
                    Remove
                  </ActionButton>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <CardBody className="text-sm text-fg-muted">No expenses in this period.</CardBody>
        )}
      </Card>
      {can(ctx.role, "expenses.manage") ? (
        <Card className="self-start">
          <CardHeader title="Add an expense" description="Rent, bills, supplies. Anything the shop pays for." />
          <CardBody>
            <ExpenseForm today={zonedDate(new Date(), ctx.shop.timezone)} />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
