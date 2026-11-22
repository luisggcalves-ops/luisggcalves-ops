import type { Metadata } from "next";
import { requirePageContext } from "@/server/tenancy";
import { canViewFinance, listPayments } from "@/server/domain/finance/service";
import { listProducts } from "@/server/domain/finance/inventory";
import { listStaff } from "@/server/domain/staff/service";
import { can } from "@/server/authz/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PaymentForm } from "@/components/finance/payment-form";
import { VoidPaymentButton } from "@/components/finance/payment-summary";
import { formatMoney } from "@/lib/money";
import { periodFor, type FinanceSearch } from "../period";

export const metadata: Metadata = { title: "Payments" };
const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", transfer: "Transfer", other: "Other" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<FinanceSearch> }) {
  const ctx = await requirePageContext("dashboard.view");
  if (!(await canViewFinance(ctx))) return null;
  const period = periodFor(await searchParams, ctx.shop.timezone);
  const [rows, products, staff] = await Promise.all([listPayments(ctx, period), listProducts(ctx), listStaff(ctx)]);
  const m = (c: number) => formatMoney(c, ctx.shop.currency);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: ctx.shop.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader title="Payments" description={`${rows.length} in ${period.label.toLowerCase()}. Voided payments stay listed for the record.`} />
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map(({ payment: p, customerName, items }) => (
              <li key={p.id} className={p.status === "voided" ? "px-5 py-3 opacity-60" : "px-5 py-3"}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {customerName ?? "Walk-in sale"}
                      <span className="ml-2 text-[12px] font-normal text-fg-muted">
                        {fmt.format(p.recordedAt)} · {METHOD_LABEL[p.method]}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-fg-muted">
                      {items.map((i) => `${i.description}${i.quantity > 1 ? ` ×${i.quantity}` : ""}${i.staffName ? ` (${i.staffName})` : ""}`).join(" · ")}
                      {p.tipCents ? ` · tip ${m(p.tipCents)}` : ""}
                    </p>
                    {p.status === "voided" ? <p className="mt-0.5 text-[12px] text-danger">Voided: {p.voidReason}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={p.status === "voided" ? "tabular line-through" : "font-semibold tabular"}>{m(p.totalCents)}</span>
                    {p.status === "voided" ? <Badge tone="danger">Voided</Badge> : null}
                  </div>
                </div>
                {p.status === "recorded" && can(ctx.role, "payments.void") ? (
                  <div className="mt-1">
                    <VoidPaymentButton paymentId={p.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <CardBody className="text-sm text-fg-muted">No payments in this period. Payments are taken from the appointment panel.</CardBody>
        )}
      </Card>
      <Card className="self-start">
        <CardHeader title="Product sale" description="Sell products without an appointment, e.g. a walk-in buying wax." />
        <CardBody>
          {products.length ? (
            <PaymentForm products={products} staff={staff} canChooseStaff currency={ctx.shop.currency} submitLabel="Record sale" />
          ) : (
            <p className="text-sm text-fg-muted">Add products in Inventory first.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
