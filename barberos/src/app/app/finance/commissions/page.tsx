import type { Metadata } from "next";
import { requirePageContext } from "@/server/tenancy";
import { canViewFinance, getFinanceSummary, listCommissionRules, listCommissions } from "@/server/domain/finance/service";
import { listServices } from "@/server/domain/services/service";
import { listStaff } from "@/server/domain/staff/service";
import { can } from "@/server/authz/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/action-button";
import { deactivateRuleAction } from "@/app/actions/finance";
import { describeRule } from "@/server/domain/finance/commission";
import { formatMoney } from "@/lib/money";
import { periodFor, type FinanceSearch } from "../period";
import { CommissionRuleForm } from "./rule-form";

export const metadata: Metadata = { title: "Commissions" };

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<FinanceSearch> }) {
  const ctx = await requirePageContext("dashboard.view");
  if (!(await canViewFinance(ctx))) return null;
  const period = periodFor(await searchParams, ctx.shop.timezone);
  const [summary, lines, rules, staff, services] = await Promise.all([
    getFinanceSummary(ctx, period),
    listCommissions(ctx, period),
    listCommissionRules(ctx),
    listStaff(ctx),
    listServices(ctx),
  ]);
  const m = (c: number) => formatMoney(c, ctx.shop.currency);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: ctx.shop.timezone, day: "numeric", month: "short" });
  const canManage = can(ctx.role, "commissions.manage");
  const scope = (r: (typeof rules)[number]) =>
    [r.rule.appliesTo === "products" ? "Product sales" : (r.serviceName ?? "All services"), r.staffName ?? "all barbers"].join(" · ");
  const hasDefault = rules.some((r) => r.rule.appliesTo === "services" && !r.rule.staffMemberId && !r.rule.serviceId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="To pay out" description={`Commission earned in ${period.label.toLowerCase()}, from payments that weren't voided.`} />
          {summary.byStaff.length ? (
            <ul className="divide-y divide-border">
              {summary.byStaff.map((b) => (
                <li key={b.staffMemberId} className="flex items-center justify-between px-5 py-3">
                  <span>
                    <span className="block text-sm font-medium">{b.name}</span>
                    <span className="block text-[12px] text-fg-muted">
                      on {m(b.revenue)} of sales{b.tips ? ` · plus ${m(b.tips)} in tips` : ""}
                    </span>
                  </span>
                  <span className="text-lg font-semibold tabular">{m(b.commission)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody className="text-sm text-fg-muted">Nothing earned in this period.</CardBody>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Commission lines"
            description={`Each line shows the rule that was used.${lines.length > 50 ? ` Showing the latest 50 of ${lines.length}. The full list is in Reports.` : ""}`}
          />
          {lines.length ? (
            <ul className="divide-y divide-border">
              {lines.slice(0, 50).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">
                      {l.staffName} · {l.description}
                    </span>
                    <span className="block text-[12px] text-fg-muted">
                      {fmt.format(l.recordedAt)} · {describeRule(l.ruleSnapshot as never, m)} of {m(l.baseCents)}
                    </span>
                  </span>
                  <span className="tabular">{m(l.amountCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody className="text-sm text-fg-muted">No commission lines in this period.</CardBody>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Commission rules" description="The most specific rule wins: barber + service, then service, then barber, then everyone." />
          {!hasDefault ? (
            <CardBody className="border-b border-border">
              <p className="rounded-lg bg-warning-bg px-3 py-2 text-[13px] text-warning">
                No default rule yet. Without one, services earn no commission unless a barber or service rule matches.
              </p>
            </CardBody>
          ) : null}
          {rules.length ? (
            <ul className="divide-y divide-border">
              {rules.map((r) => (
                <li key={r.rule.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>
                    <span className="block font-medium tabular">{describeRule(r.rule, m)}</span>
                    <span className="block text-[12px] text-fg-muted">{scope(r)}</span>
                  </span>
                  {canManage ? (
                    <ActionButton action={deactivateRuleAction} fields={{ ruleId: r.rule.id }} confirm="Remove this rule? Past commissions are not affected.">
                      Remove
                    </ActionButton>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {canManage ? (
            <CardBody className="border-t border-border">
              <p className="mb-3 text-[13px] text-fg-muted">Saving a rule replaces any rule with the same scope. It applies to new payments only.</p>
              <CommissionRuleForm staff={staff.map((s) => ({ id: s.id, name: s.displayName }))} services={services.map((s) => ({ id: s.id, name: s.name }))} />
            </CardBody>
          ) : (
            <CardBody className="text-[13px] text-fg-muted">Only the owner can change commission rules.</CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
