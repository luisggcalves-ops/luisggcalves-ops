import type { Metadata } from "next";
import Link from "next/link";
import { requirePageContext } from "@/server/tenancy";
import { getMyEarnings } from "@/server/domain/finance/service";
import { Card, CardBody } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { resolvePeriod } from "@/lib/period";
import { formatClock, zonedDate } from "@/lib/time";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Earnings" };

const TABS = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const ctx = await requirePageContext("barber_app.view");
  const { p = "today" } = await searchParams;
  const tz = ctx.shop.timezone;
  const period = resolvePeriod({ p: TABS.some((t) => t.key === p) ? p : "today" }, zonedDate(new Date(), tz));
  const e = await getMyEarnings(ctx, period);
  const m = (c: number) => formatMoney(c, ctx.shop.currency);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Earnings</h1>
      <div className="grid grid-cols-3 rounded-xl border border-border bg-surface p-1" role="tablist">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/barber/earnings?p=${t.key}`}
            role="tab"
            aria-selected={period.key === t.key}
            className={cn("rounded-lg py-2 text-center text-sm", period.key === t.key ? "bg-primary font-medium text-primary-fg" : "text-fg-muted")}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {!e ? (
        <p className="text-sm text-fg-muted">You don&apos;t have a barber profile in this shop.</p>
      ) : (
        <>
          <Card inverse>
            <CardBody>
              <p className="text-[13px] opacity-75">Your commission</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight tabular" data-testid="my-commission">
                {m(e.commission)}
              </p>
              <p className="mt-1 text-[13px] opacity-75">+ {m(e.tips)} in tips</p>
            </CardBody>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardBody>
                <p className="text-[12px] text-fg-muted">Services done</p>
                <p className="mt-0.5 text-xl font-semibold tabular">{e.services}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-[12px] text-fg-muted">Sales you made</p>
                <p className="mt-0.5 text-xl font-semibold tabular">{m(e.revenue)}</p>
              </CardBody>
            </Card>
          </div>
          {e.recent.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {e.recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{r.description}</span>
                    <span className="block text-[12px] text-fg-muted">
                      {r.customerName ?? "Walk-in"} · {fmt.format(r.recordedAt)} {formatClock(r.recordedAt, tz)}
                    </span>
                  </span>
                  <span className="tabular">{m(r.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-fg-muted">No paid services in this period yet.</p>
          )}
          <p className="text-center text-[12px] text-fg-subtle">Calculated from recorded payments, using the shop&apos;s commission rules.</p>
        </>
      )}
    </div>
  );
}
